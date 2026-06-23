/**
 * The player-profile projection — composed of TWO read-only layers (round 3, Feature 5):
 *
 *   1. Lane A — the materialised `player_profile_stats_mv` math: `projectWindow`/`projectPlayer`
 *      derive the windowed mv rows (`ProfileStatBlock`) the leaderboard/discovery SEAM reads
 *      through projection-store.ts (getProfileStats/getAllProjections).
 *   2. Lane B — the Profile-v2 UI view-model (`ProfileStats`) every profile surface renders, read
 *      through a swappable `ProfileProjectionSource` (default = the records-backed adapter).
 *
 * THE CARDINAL RULE (both layers): every figure here is a READ-ONLY PROJECTION over the audited
 * ledger. It owns no money path, mutates nothing, reconciles to the ledger exactly, and is drop-
 * and-rebuildable from it. Both layers source the SAME settled BetRows (and the same records/
 * helpers — periodStats/withinPeriod/streaks/clvSummary), so the mv rows and the UI view-model
 * never disagree. If a projection could ever mint or move a credit, it would be wrong.
 *
 * // SEAM (Lane A ↔ Lane B): A's projection-store is the authoritative windowed mv; B's UI reads
 * the richer per-account `ProfileStats` view-model. A's `ProfileStatBlock` is a per-window subset
 * (it has no name/day-window/tier/badges/biggestWin/clv-summary/pnl), so the UI view-model is
 * NOT a drop-in of A's mv — they coexist as two views of one ledger. The default UI source
 * (projection-adapter) derives the full `ProfileStats` from records/ledger; the wiring pass may
 * override it via `setProfileProjectionSource`.
 */

// ── Lane A: the materialised-view math ──────────────────────────────────────
import { periodStats, withinPeriod, streaks } from '../records/record.js'
import { isSportsbook, type BetRow } from '../../app/ledger-stats.js'
import { clvSummary } from '../records/clv.js'
import type { ClvDatum } from '../records/types.js'

// ── Lane B: the UI view-model types (re-used from the verified record + VIP) ─
import type {
  PeriodStats,
  StreakInfo,
  BetHighlight,
  ClvSummary,
  RecordBadge,
} from '../records/index.js'
import type { RankProgress } from '../vip/index.js'

export type {
  PeriodStats,
  StreakInfo,
  BetHighlight,
  ClvSummary,
  RecordBadge,
} from '../records/index.js'
export type { RankProgress } from '../vip/index.js'

const DAY_MS = 24 * 60 * 60 * 1000

/* ===========================================================================
 * Lane A — `player_profile_stats_mv` projection math
 * ======================================================================== */

/** A profile stat window. 7d/30d are rolling; season is anchored (settlement/season boundary);
 *  all is lifetime. */
export type StatWindow = '7d' | '30d' | 'season' | 'all'
export const STAT_WINDOWS: readonly StatWindow[] = ['7d', '30d', 'season', 'all']

/** 1 unit = 100 credits ($100) — the standard "units" denomination for net P&L. */
export const UNIT_CENTS = 10_000

/** A by-sport / by-market breakdown cell. All cents; roiBps = net/wagered in basis points. */
export interface SportStat {
  wagers: number
  wageredCents: number
  netCents: number
  wins: number
  losses: number
  roiBps: number
}

/** One row of the projection: a player's settled-activity stats over one window. Mirrors the
 *  player_profile_stats_mv columns. */
export interface ProfileStatBlock {
  playerId: string
  window: StatWindow
  wagers: number
  wins: number
  losses: number
  pushes: number
  netCents: number
  wageredCents: number
  roiBps: number
  /** Net P&L in units (net_cents / UNIT_CENTS), 2dp. */
  units: number
  /** Mean closing-line value in bps, or null until closing lines exist (honestly gated). */
  clvBeatBps: number | null
  /** Longest win streak in the window. */
  longestStreak: number
  /** Trailing streak: + for a win run, − for a loss run, 0 for none. */
  currentStreak: number
  bySport: Record<string, SportStat>
  byMarket: Record<string, SportStat>
  updatedAt: number
}

const roiToBps = (net: number, wagered: number): number =>
  wagered ? Math.round((net / wagered) * 10_000) : 0

/** The settled rows that fall in a window, relative to `now` (and the season anchor). */
export function windowRows(
  rows: BetRow[],
  window: StatWindow,
  now: number,
  seasonStartMs: number,
): BetRow[] {
  switch (window) {
    case 'all':
      return rows
    case '7d':
      return withinPeriod(rows, now, 7 * DAY_MS)
    case '30d':
      return withinPeriod(rows, now, 30 * DAY_MS)
    case 'season':
      return rows.filter((r) => r.time >= seasonStartMs)
  }
}

/** Group rows by a key and roll each group into a SportStat (reuses periodStats per group). */
function groupStats(rows: BetRow[], keyOf: (r: BetRow) => string): Record<string, SportStat> {
  const groups = new Map<string, BetRow[]>()
  for (const r of rows) {
    const k = keyOf(r) || 'unknown'
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  const out: Record<string, SportStat> = {}
  for (const [k, g] of groups) {
    const s = periodStats(g)
    out[k] = {
      wagers: s.bets,
      wageredCents: s.wagered,
      netCents: s.net,
      wins: s.wins,
      losses: s.losses,
      roiBps: roiToBps(s.net, s.wagered),
    }
  }
  return out
}

/**
 * Project ONE window for ONE player from their settled rows (+ any closing-line data). Pure.
 * `clv` only contributes the (gated) clvBeatBps; it never affects net/ROI.
 */
export function projectWindow(
  playerId: string,
  rows: BetRow[],
  clv: ClvDatum[],
  window: StatWindow,
  now: number,
  seasonStartMs: number,
): ProfileStatBlock {
  const wr = windowRows(rows, window, now, seasonStartMs)
  const s = periodStats(wr)
  const st = streaks(wr)
  const cutoff =
    window === 'all'
      ? -Infinity
      : window === 'season'
        ? seasonStartMs
        : now - (window === '7d' ? 7 : 30) * DAY_MS
  const clvWin = clv.filter((c) => c.time >= cutoff)
  const clvSum = clvSummary(clvWin)
  return {
    playerId,
    window,
    wagers: s.bets,
    wins: s.wins,
    losses: s.losses,
    pushes: s.pushes,
    netCents: s.net,
    wageredCents: s.wagered,
    roiBps: roiToBps(s.net, s.wagered),
    units: Math.round((s.net / UNIT_CENTS) * 100) / 100,
    clvBeatBps: clvSum.available ? Math.round(clvSum.avgClvPct * 100) : null,
    longestStreak: st.longestWin,
    currentStreak:
      st.currentKind === 'win' ? st.current : st.currentKind === 'loss' ? -st.current : 0,
    bySport: groupStats(wr, (r) => r.gameKey),
    byMarket: groupStats(wr, (r) => (isSportsbook(r) ? 'sportsbook' : 'casino')),
    updatedAt: now,
  }
}

/** Project every window for one player. Pure. */
export function projectPlayer(
  playerId: string,
  rows: BetRow[],
  clv: ClvDatum[],
  now: number,
  seasonStartMs: number,
): Record<StatWindow, ProfileStatBlock> {
  return {
    '7d': projectWindow(playerId, rows, clv, '7d', now, seasonStartMs),
    '30d': projectWindow(playerId, rows, clv, '30d', now, seasonStartMs),
    season: projectWindow(playerId, rows, clv, 'season', now, seasonStartMs),
    all: projectWindow(playerId, rows, clv, 'all', now, seasonStartMs),
  }
}

/* ===========================================================================
 * Lane B — the Profile-v2 UI view-model + swappable projection source
 * ======================================================================== */

/** A stats window. `lifetime` plus the three rolling windows the record already maintains. */
export type StatsWindow = 'lifetime' | 'month' | 'week' | 'day'

export const STATS_WINDOWS: { key: StatsWindow; label: string }[] = [
  { key: 'lifetime', label: 'Lifetime' },
  { key: 'month', label: '30d' },
  { key: 'week', label: '7d' },
  { key: 'day', label: '24h' },
]

/** One point on the cumulative-P&L curve: net (signed cents) through `time`. */
export interface PnlPoint {
  time: number
  /** Cumulative Σ profit (signed cents) up to and including this settled bet. */
  cumulative: number
}

/** A split row — by sport, by market, or by game. A pure grouping of settled activity. */
export interface ProfileSplit {
  key: string
  label: string
  bets: number
  /** Σ stake, cents. */
  wagered: number
  /** Σ profit (signed), cents. */
  net: number
  /** net / wagered, a fraction. */
  roi: number
  /** wins / decided, percent. */
  winRate: number
}

/**
 * Tail-success — of the bets a player placed by TAILING another's slip, how many won.
 * Honestly GATED: the book doesn't yet stamp tail provenance on a placed bet, so `available`
 * is false until it does. // SEAM (wiring): fill from tail provenance once tail/fade marks the
 * bets it places (social/tail.ts → bets-store), or from Lane A's mv if it carries it.
 */
export interface TailSuccess {
  available: boolean
  tails: number
  settled: number
  wins: number
  /** wins / settled-decided, percent. */
  successRate: number
  note?: string
}

/**
 * The full Profile v2 projection for one account — the superset every surface renders.
 * Mirrors what `player_profile_stats_mv` will materialise. All cents are integer credits.
 */
export interface ProfileStats {
  accountId: string
  name: string
  /** Lifetime + the three rolling windows (from the verified record). */
  lifetime: PeriodStats
  periods: { day: PeriodStats; week: PeriodStats; month: PeriodStats }
  /**
   * Units won — Σ over decided bets of (profit / stake): a stake-size-independent P&L (a win at
   * decimal d contributes d−1, a loss −1). The canonical "units" a bettor brags about; derived
   * from the same settled rows the net is, so it reconciles to the ledger.
   */
  units: number
  /** == lifetime.net, surfaced explicitly as the headline "net credits". */
  netCents: number
  biggestWin: BetHighlight | null
  streak: StreakInfo
  /** Cumulative P&L over time (oldest → newest); the last point's `cumulative` === lifetime.net. */
  pnl: PnlPoint[]
  /** Where data exists (live sportsbook detail). */
  bySport: ProfileSplit[]
  /** Where data exists (live sportsbook detail). */
  byMarket: ProfileSplit[]
  byGame: ProfileSplit[]
  clv: ClvSummary
  tailSuccess: TailSuccess
  /** VIP tier/rank, computed off the VERIFIED lifetime wagered. */
  tier: RankProgress
  badges: RecordBadge[]
  /** True when seeded demo rows contributed (mock/local default). */
  demoSeeded: boolean
}

/** Pick the PeriodStats for a window off a ProfileStats. */
export function statsForWindow(s: ProfileStats, w: StatsWindow): PeriodStats {
  return w === 'lifetime' ? s.lifetime : s.periods[w]
}

/**
 * The projection source — what the surfaces read through. Lane A's `player_profile_stats_mv`
 * implements this; the default (projection-adapter) derives it from records/ledger.
 */
export interface ProfileProjectionSource {
  /** The full projection for one account at `now` (rolling windows are relative to `now`). */
  statsFor(accountId: string, now: number): ProfileStats
  /** Every account that has a viewable profile (org players ∪ any seeded demo ids). */
  listProfiles(): { id: string; name: string }[]
}

// `defaultSource` is registered by projection-adapter.ts on import (the mock/local default);
// `override` is what the wiring pass / a test installs on top. We never statically import the
// adapter here (that would be an init cycle), so the adapter pushes itself in via
// installDefaultProjectionSource and `resetProfileProjectionSource` falls back to it.
let defaultSource: ProfileProjectionSource | null = null
let override: ProfileProjectionSource | null = null

/** Register the fallback source (the records-backed adapter calls this on import). */
export function installDefaultProjectionSource(s: ProfileProjectionSource): void {
  defaultSource = s
}

/** Install/override the projection source. // SEAM: the wiring pass points this at Lane A's mv. */
export function setProfileProjectionSource(s: ProfileProjectionSource): void {
  override = s
}

/** Drop any override and fall back to the default records-backed adapter (tests + mock default). */
export function resetProfileProjectionSource(): void {
  override = null
}

function active(): ProfileProjectionSource {
  const s = override ?? defaultSource
  if (!s)
    throw new Error('profile projection source not installed (import profile/projection-adapter)')
  return s
}

/** Whether a non-default source has been installed (mostly for diagnostics/tests). */
export function hasCustomProjectionSource(): boolean {
  return override !== null
}

/** Read one account's full projection. */
export function profileStats(accountId: string, now: number): ProfileStats {
  return active().statsFor(accountId, now)
}

/** List every viewable profile. */
export function listProfiles(): { id: string; name: string }[] {
  return active().listProfiles()
}
