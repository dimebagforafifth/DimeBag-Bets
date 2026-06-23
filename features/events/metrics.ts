/**
 * Competition metrics — pure aggregations over a player's SETTLED activity in a time window.
 *
 * Everything here is read-only over the durable book ledger (`getBookLedger` → `toBetRows`)
 * and the sportsbook bets store (`getBets`, for parlay hits). No store is written; no money
 * moves. The pure shapes (`*From` / `longestWinStreak` / …) take rows so they unit-test in
 * isolation; the `metricValue` convenience reads the live stores for a given account+window.
 *
 * Units are metric-native: cents for wagered / net, a count for parlay_hits / win_streak, a
 * multiple for biggest_multiplier. `formatMetricValue` renders each.
 */

import { getBookLedger } from '../../app/book-ledger.js'
import { toBetRows, type BetRow } from '../../app/ledger-stats.js'
import { getBets, type BookBet } from '../../app/book/bets-store.js'
import { formatMoney } from '../../games/shared/money.js'
import type { MetricType } from './types.js'

/* ------------------------------- pure math ------------------------------ */

/** Σ stake over the rows (turnover / handle), cents. */
export function totalWagered(rows: BetRow[]): number {
  return rows.reduce((sum, r) => sum + r.stake, 0)
}

/** Σ profit over the rows (signed), cents. */
export function netProfit(rows: BetRow[]): number {
  return rows.reduce((sum, r) => sum + r.profit, 0)
}

/** The single biggest WINNING multiplier hit (>1). 0 when there were no wins. */
export function biggestMultiplier(rows: BetRow[]): number {
  let best = 0
  for (const r of rows) {
    if (r.outcome === 'win' && r.multiplier > best) best = r.multiplier
  }
  return best
}

/** Longest run of consecutive WINS, oldest→newest. A loss breaks the run; a push / void is
 *  neutral (skipped, like a no-action bet — it neither extends nor breaks the streak). */
export function longestWinStreak(rows: BetRow[]): number {
  const decided = [...rows]
    .sort((a, b) => a.time - b.time)
    .filter((r) => r.outcome === 'win' || r.outcome === 'loss')
  let best = 0
  let run = 0
  for (const r of decided) {
    if (r.outcome === 'win') {
      run += 1
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return best
}

/** Count of winning parlays among the bets (multi-leg tickets that came in). */
export function wonParlays(bets: BookBet[]): number {
  return bets.filter((b) => b.mode === 'parlay' && b.status === 'won').length
}

/** Compute a metric from already-windowed rows (+ parlay bets for parlay_hits). Pure. */
export function metricValueFrom(metric: MetricType, rows: BetRow[], parlayBets: BookBet[]): number {
  switch (metric) {
    case 'wagered':
      return totalWagered(rows)
    case 'net_profit':
      return netProfit(rows)
    case 'biggest_multiplier':
      return biggestMultiplier(rows)
    case 'win_streak':
      return longestWinStreak(rows)
    case 'parlay_hits':
      return wonParlays(parlayBets)
  }
}

/* --------------------------- live store readers ------------------------- */

/**
 * The book-ledger tags every settled wager with the GAME that was active when it was placed
 * (its `gameKey`). A COMPETITION ENTRY-FEE hold is placed under this dedicated key so its
 * collection 'loss' is recognizable: the fee still moves through core (funding the pool,
 * audited in the ledger), but it is a tournament buy-in, not a bet — if it scored it would
 * pollute the betting metrics of any OTHER overlapping competition the player is in (its 'loss'
 * lands at collection time, inside still-live windows). `scorableBetRows` filters it out, so
 * standings + VIP-eligibility see only real betting activity. The store sets this key around
 * the entry-fee placement (see store.joinCompetition).
 */
export const ENTRY_GAME_KEY = 'competition-entry'

/** An account's settled bet rows for scoring — every real bet, EXCLUDING entry-fee holds. */
export function scorableBetRows(accountId: string): BetRow[] {
  return toBetRows(getBookLedger(), accountId).filter((r) => r.gameKey !== ENTRY_GAME_KEY)
}

/** This account's scorable bet rows whose settle time falls in [start, end]. Read-only. */
export function rowsInWindow(accountId: string, start: number, end: number): BetRow[] {
  return scorableBetRows(accountId).filter((r) => r.time >= start && r.time <= end)
}

/** This account's parlay bets settled in [start, end] (for the parlay_hits metric). */
export function parlayBetsInWindow(accountId: string, start: number, end: number): BookBet[] {
  return getBets().filter(
    (b) =>
      b.accountId === accountId &&
      b.mode === 'parlay' &&
      b.settledAt != null &&
      b.settledAt >= start &&
      b.settledAt <= end,
  )
}

/** A player's metric value for a window, read live off the ledger + bets store. Read-only. */
export function metricValue(
  metric: MetricType,
  accountId: string,
  start: number,
  end: number,
): number {
  const rows = rowsInWindow(accountId, start, end)
  const parlays = metric === 'parlay_hits' ? parlayBetsInWindow(accountId, start, end) : []
  return metricValueFrom(metric, rows, parlays)
}

/* ------------------------------- display -------------------------------- */

export const METRIC_META: Record<
  MetricType,
  { label: string; unit: 'cents' | 'count' | 'multiple'; hint: string }
> = {
  wagered: { label: 'Credits wagered', unit: 'cents', hint: 'Most turnover in the window wins' },
  net_profit: { label: 'Net profit', unit: 'cents', hint: 'Biggest net winner in the window' },
  biggest_multiplier: {
    label: 'Biggest multiplier',
    unit: 'multiple',
    hint: 'Single biggest winning multiplier',
  },
  parlay_hits: { label: 'Parlay hits', unit: 'count', hint: 'Most winning parlays' },
  win_streak: { label: 'Win streak', unit: 'count', hint: 'Longest run of consecutive wins' },
}

/** Render a metric-native value for the UI. */
export function formatMetricValue(metric: MetricType, value: number): string {
  switch (METRIC_META[metric].unit) {
    case 'cents':
      return formatMoney(value)
    case 'multiple':
      return `${value.toFixed(2)}×`
    case 'count':
      return String(value)
  }
}
