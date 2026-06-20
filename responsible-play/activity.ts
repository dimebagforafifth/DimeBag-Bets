/**
 * Activity projections — the read layer over the durable book ledger (CLAUDE.md §3).
 *
 * Two pure projections, both a direct SUM over resolved ledger rows so they RECONCILE to the
 * ledger by construction and move no money:
 *   - `summarizeActivity` → the player's "My Stat Sheet" (bets, turnover, net credits, …).
 *   - `usageSince`        → period-to-date turnover + net loss, the source the core limit gate
 *                           reads (wired in store.ts via setLimitUsageReader).
 *
 * A resolved ledger entry carries `pendingDelta = −stake` (the hold released) and
 * `balanceDelta = profit` (negative on a loss), so stake = −pendingDelta and a player's net
 * loss over a window is −Σ balanceDelta.
 */

import type { LedgerEntry } from '../ledger/index.js'

export interface ActivitySummary {
  /** Resolved bets in scope. */
  bets: number
  wins: number
  losses: number
  /** Pushes + voids (stake returned). */
  pushes: number
  /** Total staked (turnover), integer cents. */
  wageredCents: number
  /** Net credits: wins − losses, integer cents (positive = ahead). */
  netCents: number
  /** Largest single win profit, integer cents. */
  biggestWinCents: number
  /** First / last resolved-bet timestamps in scope (null when there's no activity). */
  firstAt: number | null
  lastAt: number | null
}

export const EMPTY_ACTIVITY: ActivitySummary = {
  bets: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  wageredCents: 0,
  netCents: 0,
  biggestWinCents: 0,
  firstAt: null,
  lastAt: null,
}

/** Stake of a resolved entry (the released hold). */
const stakeOf = (e: LedgerEntry): number => -e.pendingDelta

/**
 * Project a slice of resolved ledger rows into the My Stat Sheet summary. Pure; every field is
 * a sum/extremum over the rows, so it reconciles to the ledger. Non-resolve rows are ignored.
 */
export function summarizeActivity(entries: LedgerEntry[]): ActivitySummary {
  const out: ActivitySummary = { ...EMPTY_ACTIVITY }
  for (const e of entries) {
    if (e.kind !== 'resolve') continue
    const stake = stakeOf(e)
    const profit = e.balanceDelta
    out.bets += 1
    out.wageredCents += stake
    out.netCents += profit
    if (e.outcome === 'win') out.wins += 1
    else if (e.outcome === 'loss') out.losses += 1
    else out.pushes += 1 // push / void — stake returned
    if (profit > out.biggestWinCents) out.biggestWinCents = profit
    out.firstAt = out.firstAt == null ? e.at : Math.min(out.firstAt, e.at)
    out.lastAt = out.lastAt == null ? e.at : Math.max(out.lastAt, e.at)
  }
  return out
}

export interface UsageSince {
  /** Turnover since `sinceMs`, integer cents. */
  wageredCents: number
  /** Net loss since `sinceMs`, integer cents (losses − wins; negative when net ahead). */
  netLossCents: number
}

/**
 * Period-to-date usage for one player over a ledger slice — the figure the core wager/loss gate
 * consults. Counts only RESOLVED turnover/result at/after `sinceMs` (an in-flight pending bet
 * isn't counted until it grades; the new stake is added by the gate itself). Pure.
 */
export function usageSince(entries: LedgerEntry[], playerId: string, sinceMs: number): UsageSince {
  let wageredCents = 0
  let netLossCents = 0
  for (const e of entries) {
    if (e.accountId !== playerId || e.kind !== 'resolve' || e.at < sinceMs) continue
    wageredCents += stakeOf(e)
    netLossCents += -e.balanceDelta // a loss (profit < 0) adds; a win subtracts
  }
  return { wageredCents, netLossCents }
}
