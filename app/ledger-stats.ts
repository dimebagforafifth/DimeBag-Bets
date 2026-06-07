/**
 * Shared analytics + adapter over the DURABLE book ledger (app/book-ledger, built on
 * the generic ledger/ module). Pure functions that roll a player's resolved-bet
 * history into the figures both the player dashboard (MyBets) and the manager's player
 * lookup show — kept in one place so the two views always agree. `toBetRows` adapts
 * the generic, money-only durable entries into the per-bet rows these views render.
 */

import type { Outcome } from '../core/index.js'
import type { LedgerEntry as TxEntry } from '../ledger/index.js'

/** One resolved bet — the row both player views render and analyse. */
export interface BetRow {
  id: number
  accountId: string
  gameKey: string
  game: string
  stake: number
  multiplier: number
  profit: number
  outcome: Outcome
  time: number
}

/**
 * Adapt durable ledger entries into bet rows: keep the 'resolve' movements (a real
 * graded bet), optionally scoped to one account, preserving order (the book ledger
 * hands them back newest-first). The game tag lives in the entry's `meta` (set when
 * the bet resolved); the stake is `meta.stake`, falling back to the released hold
 * (`pendingDelta === −stake`).
 */
export function toBetRows(entries: TxEntry[], accountId?: string): BetRow[] {
  const rows: BetRow[] = []
  for (const e of entries) {
    if (e.kind !== 'resolve') continue
    if (accountId && e.accountId !== accountId) continue
    // book-ledger's resolve entries always carry meta + multiplier + outcome; the ??
    // defaults below only guard hand-built / legacy entries, never a real resolve.
    const meta = e.meta ?? {}
    rows.push({
      id: e.seq,
      accountId: e.accountId,
      gameKey: typeof meta.game === 'string' ? meta.game : '',
      game: typeof meta.gameName === 'string' ? meta.gameName : 'Bet',
      stake: typeof meta.stake === 'number' ? meta.stake : -e.pendingDelta,
      multiplier: e.multiplier ?? 0,
      profit: e.balanceDelta,
      outcome: e.outcome ?? 'push',
      time: e.at,
    })
  }
  return rows
}

/** Which side of the house a view is scoped to. */
export type Side = 'all' | 'casino' | 'sportsbook'
export const SIDE_LABEL: Record<Side, string> = {
  all: 'All',
  casino: 'Casino',
  sportsbook: 'Sportsbook',
}

/** Sportsbook bets are tagged with the 'sportsbook' gameKey by the shell; every
 *  other gameKey is a casino game. */
export function isSportsbook(e: BetRow): boolean {
  return e.gameKey === 'sportsbook'
}

export interface Stats {
  bets: number
  wagered: number
  net: number
  wins: number
  losses: number
  winRate: number
  biggestWin: number
  bestMult: number
}

/** Lifetime (durable) figures for a bet feed. */
export function summarize(entries: BetRow[]): Stats {
  let wagered = 0
  let net = 0
  let wins = 0
  let losses = 0
  let decided = 0
  let biggestWin = 0
  let bestMult = 0
  for (const e of entries) {
    wagered += e.stake
    net += e.profit
    if (e.outcome === 'push' || e.outcome === 'void') continue
    decided += 1
    if (e.profit > 0) {
      wins += 1
      if (e.profit > biggestWin) biggestWin = e.profit
      if (e.multiplier > bestMult) bestMult = e.multiplier
    } else {
      losses += 1
    }
  }
  return {
    bets: entries.length,
    wagered,
    net,
    wins,
    losses,
    winRate: decided ? Math.round((wins / decided) * 100) : 0,
    biggestWin,
    bestMult,
  }
}

export interface GameTotals {
  key: string
  name: string
  bets: number
  wagered: number
  net: number
}

/** Group a bet feed by game, most-played first. */
export function byGame(entries: BetRow[]): GameTotals[] {
  const map = new Map<string, GameTotals>()
  for (const e of entries) {
    const g = map.get(e.gameKey) ?? { key: e.gameKey, name: e.game, bets: 0, wagered: 0, net: 0 }
    g.bets += 1
    g.wagered += e.stake
    g.net += e.profit
    map.set(e.gameKey, g)
  }
  return [...map.values()].sort((a, b) => b.bets - a.bets)
}
