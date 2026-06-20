/**
 * The player-profile projection (Feature 5, foundation) — `player_profile_stats_mv`.
 *
 * THE CARDINAL RULE: this is a READ-ONLY PROJECTION over the audited ledger (via the same
 * settled BetRows the verified-records lane reads). It owns no money path, mutates nothing, and
 * is a DETERMINISTIC function of (settled rows, now, season anchor) — so it is drop-and-
 * rebuildable from the ledger to identical values, and Σ net_cents reconciles to the ledger net
 * exactly (no inflation). If a projection could ever mint or move a credit, it would be wrong.
 *
 * It EXTENDS the records lane (reuses periodStats / withinPeriod / streaks / byGame / clvSummary)
 * rather than re-deriving stats, adding the windowed mv shape the profile/leaderboard surfaces
 * need: per-window ROI in bps, units, win/loss streaks, and by-sport / by-market breakdowns.
 *
 * Pure + dependency-free of any store. The materialized store (projection-store.ts) caches these
 * and recomputes them on each settlement event.
 */

import { periodStats, withinPeriod, streaks } from '../records/record.js'
import { isSportsbook, type BetRow } from '../app/ledger-stats.js'
import { clvSummary } from '../records/clv.js'
import type { ClvDatum } from '../records/types.js'

const DAY_MS = 24 * 60 * 60 * 1000

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

const roiToBps = (net: number, wagered: number): number => (wagered ? Math.round((net / wagered) * 10_000) : 0)

/** The settled rows that fall in a window, relative to `now` (and the season anchor). */
export function windowRows(rows: BetRow[], window: StatWindow, now: number, seasonStartMs: number): BetRow[] {
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
  const cutoff = window === 'all' ? -Infinity : window === 'season' ? seasonStartMs : now - (window === '7d' ? 7 : 30) * DAY_MS
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
    currentStreak: st.currentKind === 'win' ? st.current : st.currentKind === 'loss' ? -st.current : 0,
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
