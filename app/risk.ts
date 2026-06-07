/**
 * Risk & exposure analytics (CLAUDE.md §4) — pure functions the manager risk panel
 * uses to read the book: realized hold from the durable ledger, per-game hold, the
 * biggest winners/losers by figure, and a threshold checker that raises alerts. Pure
 * (no singletons): the panel feeds them the live ledger rows + the org + thresholds.
 *
 * Convention: a BetRow's `profit` is the PLAYER's P&L (positive = player won). The
 * book wins what players lose, so book net = −Σ profit and hold = book net / handle.
 */

import { bookPending, creditUtilization, membersByRole, type Org } from '../org/index.js'
import type { BetRow } from './ledger-stats.js'

export interface HoldStats {
  /** Total staked (turnover). */
  handle: number
  /** Book P&L in cents (positive = the book is up). */
  bookNet: number
  /** Realized hold = bookNet / handle (0 when there's no handle). */
  hold: number
  bets: number
}

/** Book-wide realized hold across all resolved bets. Voids (no action) are excluded
 *  from handle/net; pushes count as handle (settled action that tied). */
export function bookHold(rows: BetRow[]): HoldStats {
  let handle = 0
  let playerNet = 0
  let bets = 0
  for (const r of rows) {
    if (r.outcome === 'void') continue
    handle += r.stake
    playerNet += r.profit
    bets += 1
  }
  const bookNet = -playerNet
  return { handle, bookNet, hold: handle ? bookNet / handle : 0, bets }
}

export interface GameHold extends HoldStats {
  key: string
  name: string
}

/** Realized hold per game, biggest handle first. */
export function holdByGame(rows: BetRow[]): GameHold[] {
  const map = new Map<string, GameHold>()
  for (const r of rows) {
    if (r.outcome === 'void') continue // no action — not turnover
    let g = map.get(r.gameKey)
    if (!g) {
      g = { key: r.gameKey, name: r.game, handle: 0, bookNet: 0, hold: 0, bets: 0 }
      map.set(r.gameKey, g)
    }
    g.handle += r.stake
    g.bookNet += -r.profit
    g.bets += 1
  }
  for (const g of map.values()) g.hold = g.handle ? g.bookNet / g.handle : 0
  return [...map.values()].sort((a, b) => b.handle - a.handle)
}

export interface Standing {
  id: string
  name: string
  figure: number
}

/** Top winners (highest figure) and losers (lowest), up to `n` each, by live figure. */
export function winnersLosers(org: Org, n = 5): { winners: Standing[]; losers: Standing[] } {
  const players = membersByRole(org, 'player').map((p) => ({
    id: p.id,
    name: p.name,
    figure: p.account.balance,
  }))
  return {
    winners: players.filter((p) => p.figure > 0).sort((a, b) => b.figure - a.figure).slice(0, n),
    losers: players.filter((p) => p.figure < 0).sort((a, b) => a.figure - b.figure).slice(0, n),
  }
}

/** Operator-configurable risk thresholds. */
export interface RiskThresholds {
  /** Flag a player at or above this fraction (0..1) of their credit line used. */
  creditUtil: number
  /** Flag when the book's live exposure exceeds this many cents (null = off). */
  exposureCap: number | null
}

export interface Alert {
  severity: 'warn' | 'info'
  message: string
}

/**
 * Check the book against the operator's thresholds → surfaced alerts. Pure: pass a
 * money formatter so this stays free of the display store (the panel passes
 * formatMoney; tests pass a stub).
 */
export function checkAlerts(
  org: Org,
  t: RiskThresholds,
  money: (cents: number) => string,
  exposure: number = bookPending(org, org.managerId),
): Alert[] {
  const alerts: Alert[] = []
  for (const p of membersByRole(org, 'player')) {
    const u = creditUtilization(p)
    if (u >= t.creditUtil) {
      alerts.push({ severity: 'warn', message: `${p.name} at ${Math.round(u * 100)}% of credit used` })
    }
  }
  if (t.exposureCap != null && exposure > t.exposureCap) {
    alerts.push({
      severity: 'warn',
      message: `Book exposure ${money(exposure)} is over the ${money(t.exposureCap)} cap`,
    })
  }
  return alerts
}
