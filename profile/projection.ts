/**
 * Profile v2 — the PROJECTION read API (round 3, Lane B / Feature 5).
 *
 * THE CARDINAL RULE: every figure here is a READ-ONLY projection over the audited ledger +
 * verified records. It reconciles to the ledger and is rebuildable from it. It NEVER writes a
 * credit. This module owns no money path and imports no money mutator.
 *
 * // SEAM (Lane A / wiring): Lane A builds `player_profile_stats_mv` (the materialised
 * projection) and exposes its read API. This file is the INTERFACE Lane B's surfaces consume.
 * The default source (projection-adapter.ts) derives the same shape from the existing
 * records/ledger layer so the surfaces are functional NOW; the wiring pass calls
 * `setProfileProjectionSource(laneAMv)` to swap in the authoritative projection — same
 * `ProfileStats` shape, so no surface changes. Build ON records/ + vip/, never fork them.
 */

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
