/**
 * The futures book (CLAUDE.md §4) — long-horizon outright markets, placed and
 * graded through the shared `core` like any other bet.
 *
 * Futures are a separate cadence from game markets: you back an outcome to win a
 * whole competition (NBA champion, the Super Bowl) and it settles once, when the
 * operator (or a real feed later) declares the winner. So this mirrors the book
 * overlay's shape: the `FUTURES` slate is the immutable base, and a small
 * settlements map records which outcome won each market — a single shared book
 * every player reads. A player's `SportsbookStore` grades its own open futures
 * tickets the moment a market settles. The pure pricing/grading already lives in
 * bets/futures.ts; this file is the thin layer that moves the figure through core.
 */

import { placeWager, resolveWager, type Account, type Wager } from '../../core/index.js'
import { potentialReturn } from '../odds.js'
import {
  FUTURES,
  findFutureOutcome,
  futureDecimal,
  gradeFuture,
  type FutureMarket,
} from '../bets/futures.js'

/* --------------------------- the settlement book -------------------------- */

const settlements = new Map<string, string>() // marketId → winning outcome id
let version = 0
const listeners = new Set<() => void>()

function bump(): void {
  version += 1
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* a listener must never break the futures book */
    }
  }
}

export function subscribeFutures(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getFuturesVersion(): number {
  return version
}

/** The futures slate with any settlements applied (status/winner set). Returns the
 *  same `FUTURES` reference while the book is clean, so reads stay cheap. */
export function getFutures(): FutureMarket[] {
  if (settlements.size === 0) return FUTURES
  return FUTURES.map((m) => {
    const winnerId = settlements.get(m.id)
    return winnerId ? { ...m, status: 'settled', winnerId } : m
  })
}

/** One market, with its settlement applied. */
export function getFutureMarket(marketId: string): FutureMarket | undefined {
  return getFutures().find((m) => m.id === marketId)
}

/** Declare the winner of a futures market — settling every open ticket on it (each
 *  player's store grades its own). Idempotent-ish: re-settling to the same winner
 *  is a no-op-ish bump; the store guards against double-grading a ticket. */
export function settleFuture(marketId: string, winnerId: string): void {
  const market = FUTURES.find((m) => m.id === marketId)
  if (!market) throw new Error(`unknown futures market ${marketId}`)
  if (!findFutureOutcome(market, winnerId)) {
    throw new Error(`unknown outcome ${winnerId} in ${marketId}`)
  }
  settlements.set(marketId, winnerId)
  bump()
}

/** Clear all settlements (re-open the slate). Mainly for tests/reset. */
export function resetFutures(): void {
  settlements.clear()
  bump()
}

/* ------------------------- tickets, through core ------------------------- */

export type FutureTicketStatus = 'open' | 'won' | 'lost' | 'void'

/** A player's futures bet — a single core wager on one outcome. */
export interface FutureTicket {
  id: string
  marketId: string
  marketName: string
  league: string
  outcomeId: string
  outcomeLabel: string
  stake: number
  /** Decimal odds locked when placed (§4 acceptance). */
  oddsDecimal: number
  wager: Wager
  status: FutureTicketStatus
  /** Points returned on settlement (0 on a loss, stake on a void). */
  returned?: number
}

let ticketSeq = 0

/** Place a futures bet: validate the market is open + the outcome exists, lock the
 *  price, and hold the stake via core. */
export function placeFutureTicket(
  account: Account,
  market: FutureMarket,
  outcomeId: string,
  stake: number,
): FutureTicket {
  if (market.status === 'settled') throw new Error(`${market.name} is already settled`)
  const outcome = findFutureOutcome(market, outcomeId)
  if (!outcome) throw new Error(`unknown outcome ${outcomeId} in ${market.id}`)

  const wager = placeWager(account, stake) // validates the stake fits availableToWager
  ticketSeq += 1
  return {
    id: `f_${ticketSeq}`,
    marketId: market.id,
    marketName: market.name,
    league: market.league,
    outcomeId,
    outcomeLabel: outcome.label,
    stake,
    oddsDecimal: futureDecimal(outcome),
    wager,
    status: 'open',
  }
}

/** Settle one open ticket against its (now-settled) market, through core. */
export function gradeFutureTicket(
  account: Account,
  ticket: FutureTicket,
  market: FutureMarket,
): FutureTicket {
  if (ticket.status !== 'open') throw new Error(`futures ticket ${ticket.id} is already settled`)
  const grade = gradeFuture(market, ticket.outcomeId) // 'win' | 'loss' | 'void'
  if (grade === 'win') {
    resolveWager(account, ticket.wager, 'win', ticket.oddsDecimal)
    ticket.status = 'won'
    ticket.returned = potentialReturn(ticket.stake, ticket.oddsDecimal)
  } else if (grade === 'loss') {
    resolveWager(account, ticket.wager, 'loss')
    ticket.status = 'lost'
    ticket.returned = 0
  } else {
    // not yet settled (shouldn't happen when the store only grades settled markets)
    resolveWager(account, ticket.wager, 'void')
    ticket.status = 'void'
    ticket.returned = ticket.stake
  }
  return ticket
}
