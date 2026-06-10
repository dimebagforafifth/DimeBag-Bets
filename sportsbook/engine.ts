/**
 * Sportsbook bet engine (CLAUDE.md §3, §4). Turns a bet slip into real `core`
 * wagers and settles them from results — holding no points of its own.
 *
 * A ticket is one bet: a SINGLE (one selection) or a PARLAY (≥2 selections, all
 * must win). Odds lock when the ticket is placed. Settlement follows the house
 * rules: a losing leg loses the parlay; a push/void leg DROPS OUT and the parlay
 * re-prices on the legs that remain (down to a straight bet if only one is left);
 * if every leg pushes/voids the stake is returned (CLAUDE.md §4).
 */

import type { Account, Outcome, Wager } from '../core/index.js'
import { adjustBalance, placeWager, resolveAtMultiplier, resolveWager } from '../core/index.js'
import {
  decimalFromAmerican,
  impliedProbability,
  MAX_PARLAY_DECIMAL,
  parlayDecimal,
  potentialReturn,
} from './odds.js'
import { gradeSelection, type GameEvent, type MatchResult, type Selection } from './markets.js'
import { liveWinProb } from './live.js'

export type TicketKind = 'single' | 'parlay'
export type TicketStatus = 'open' | 'won' | 'lost' | 'push' | 'void' | 'cashed'

/** The book's edge on a cash-out — the price of settling early. Shown to the
 *  player, not hidden (CLAUDE.md §4 honest-by-default). */
export const CASHOUT_MARGIN = 0.05

export interface Ticket {
  id: string
  kind: TicketKind
  legs: Selection[]
  stake: number
  /** Combined decimal odds locked at placement. */
  oddsDecimal: number
  wager: Wager
  status: TicketStatus
  /** Per-leg grades, set once the ticket is settled. */
  legOutcomes?: Outcome[]
  /** Points returned to the player on settlement (0 on a loss, stake on a push). */
  returned?: number
}

let ticketSeq = 0

/** The locked combined decimal for a ticket of `legs`. Singles use the one leg;
 *  parlays multiply (capped at the max payout). */
export function priceTicket(kind: TicketKind, legs: Selection[]): number {
  if (kind === 'single') {
    if (legs.length !== 1) throw new Error('a single must have exactly one selection')
    return decimalFromAmerican(legs[0].odds)
  }
  if (legs.length < 2) throw new Error('a parlay needs at least two selections')
  return parlayDecimal(legs.map((l) => l.odds))
}

/** Two legs from the same event are a related contingency — not combinable in a
 *  parlay (CLAUDE.md §4). */
export function hasRelatedLegs(legs: Selection[]): boolean {
  return new Set(legs.map((l) => l.eventId)).size !== legs.length
}

export interface PlaceTicketOptions {
  kind: TicketKind
  legs: Selection[]
  stake: number
  /** A same-game parlay (bet builder): the player has deliberately combined
   *  several markets on ONE game, so the related-contingency block is opted out of
   *  for this ticket. Pricing and settlement are unchanged — the legs still grade
   *  off the one game's result and the odds still multiply (CLAUDE.md §4). */
  sameGameParlay?: boolean
}

/** Place a ticket: validate it, lock the price, and hold the stake via core. */
export function placeTicket(account: Account, opts: PlaceTicketOptions): Ticket {
  const { kind, legs, stake, sameGameParlay } = opts
  if (kind === 'parlay' && !sameGameParlay && hasRelatedLegs(legs)) {
    throw new Error('cannot parlay two selections from the same event')
  }
  const oddsDecimal = priceTicket(kind, legs) // also validates the leg count
  const wager = placeWager(account, stake) // validates stake fits availableToWager

  ticketSeq += 1
  return {
    id: `t_${ticketSeq}`,
    kind,
    legs,
    stake,
    oddsDecimal,
    wager,
    status: 'open',
  }
}

/** Map a settled ticket's per-leg grades into its overall status (never 'cashed' —
 *  that's a player cash-out, not a grade). */
function statusFor(outcomes: Outcome[]): Exclude<TicketStatus, 'open' | 'cashed'> {
  if (outcomes.includes('loss')) return 'lost'
  const winners = outcomes.filter((o) => o === 'win').length
  if (winners === 0) return outcomes.includes('push') ? 'push' : 'void'
  return 'won'
}

/** The outcome of a ticket against a set of results — the pure grading math, shared
 *  by the open-ticket settle (gradeTicket) and the already-settled re-grade
 *  (regradeTicket). `returned` is the points the player ends with: 0 on a loss, the
 *  stake on a push/void, stake × winning-decimal on a win. */
interface Settlement {
  status: Exclude<TicketStatus, 'open' | 'cashed'>
  outcomes: Outcome[]
  /** The combined decimal actually paid (winners only); the locked odds otherwise. */
  decimal: number
  returned: number
}
function computeSettlement(
  ticket: Ticket,
  results: Record<string, MatchResult | null | undefined>,
): Settlement {
  const outcomes = ticket.legs.map((l) => gradeSelection(l, results[l.eventId]))
  const status = statusFor(outcomes)
  if (status === 'won') {
    // Re-price on the legs that actually won (push/void legs contribute nothing).
    const winningOdds = ticket.legs.filter((_, i) => outcomes[i] === 'win').map((l) => l.odds)
    const decimal = Math.min(
      MAX_PARLAY_DECIMAL,
      winningOdds.reduce((a, o) => a * decimalFromAmerican(o), 1),
    )
    return { status, outcomes, decimal, returned: potentialReturn(ticket.stake, decimal) }
  }
  if (status === 'lost') return { status, outcomes, decimal: ticket.oddsDecimal, returned: 0 }
  // push or void: stake returned, figure unchanged.
  return { status, outcomes, decimal: ticket.oddsDecimal, returned: ticket.stake }
}

/**
 * Settle an OPEN ticket against final results, adjusting the figure through core.
 *  - any leg lost → ticket lost (lose the stake)
 *  - otherwise the winning legs re-price (push/void legs drop out): win at that
 *    decimal; if no legs won, it's a push/void and the stake is returned.
 */
export function gradeTicket(
  account: Account,
  ticket: Ticket,
  results: Record<string, MatchResult | null | undefined>,
): Ticket {
  if (ticket.status !== 'open') throw new Error(`ticket ${ticket.id} is already settled`)

  const s = computeSettlement(ticket, results)
  ticket.legOutcomes = s.outcomes
  ticket.status = s.status

  if (s.status === 'lost') {
    resolveWager(account, ticket.wager, 'loss')
    ticket.returned = 0
    return ticket
  }
  if (s.status === 'won') {
    resolveWager(account, ticket.wager, 'win', s.decimal)
    ticket.oddsDecimal = s.decimal // reflect the re-priced odds actually paid
    ticket.returned = s.returned
    return ticket
  }
  // push or void: stake returned, figure unchanged.
  resolveWager(account, ticket.wager, s.status === 'push' ? 'push' : 'void')
  ticket.returned = ticket.stake
  return ticket
}

/**
 * The figure effect a settlement HAD (or would have) on the account, mirroring
 * `core.resolveWager` exactly — including the per-head max-payout cap on a win
 * (Account.maxPayout). Won: the capped profit; lost: −stake; push/void: 0. We can't
 * read this back off `ticket.returned` (which records the UNCAPPED potential return),
 * so the re-grade recomputes it from status + winning decimal the same way core does.
 */
function figureEffect(
  stake: number,
  status: TicketStatus,
  decimal: number,
  maxPayout: number | null | undefined,
): number {
  if (status === 'won') {
    let profit = Math.round(stake * (decimal - 1))
    if (maxPayout != null && profit > maxPayout) profit = maxPayout // core's operator cap
    return profit
  }
  if (status === 'lost') return -stake
  return 0 // push / void: stake returned, figure unchanged
}

/**
 * Re-grade an ALREADY-SETTLED ticket against a corrected result (CLAUDE.md §4 —
 * palpable-error re-settle / a result the operator fixed by hand after it had
 * already graded off the feed). The stake was released at the first settlement, so
 * this never touches `pending`; it moves the figure by the DIFFERENCE between the
 * settlement's prior figure effect and the corrected one, through core's
 * `adjustBalance` (the same manual-adjustment primitive the operator uses elsewhere).
 * Both effects are computed cap-aware via `figureEffect`, so the corrected figure
 * lands EXACTLY where a clean first-time grade at the new result would — even with a
 * max-payout cap in play. Idempotent: an unchanged outcome moves nothing. A cashed-out
 * ticket is left alone (the player already took a settled-early price). Returns true
 * if the figure moved.
 */
export function regradeTicket(
  account: Account,
  ticket: Ticket,
  results: Record<string, MatchResult | null | undefined>,
): boolean {
  if (ticket.status === 'open') throw new Error(`ticket ${ticket.id} is open; use gradeTicket`)
  if (ticket.status === 'cashed') return false // a cashed ticket isn't re-graded

  // The prior effect, from the ticket's standing status + the decimal it won at.
  const prevEffect = figureEffect(ticket.stake, ticket.status, ticket.oddsDecimal, account.maxPayout)
  const s = computeSettlement(ticket, results)
  const newEffect = figureEffect(ticket.stake, s.status, s.decimal, account.maxPayout)
  const delta = newEffect - prevEffect

  ticket.legOutcomes = s.outcomes
  ticket.status = s.status
  ticket.returned = s.returned
  if (s.status === 'won') ticket.oddsDecimal = s.decimal

  if (delta !== 0) {
    adjustBalance(account, delta)
    return true
  }
  return false
}

/**
 * The current cash-out value (cents) of an open ticket — what the book will buy
 * it back for right now — or 0 if it can't be cashed out (already settled, a leg
 * has lost, or nothing has kicked off yet).
 *
 * It's the bet's expected value at the live prices, less the cash-out margin:
 *   value = stake × Π(legFactor) × (1 − margin)
 * where each leg contributes its locked decimal scaled by how likely it is to
 * still win — decided winners count fully (×decimal), a decided loser kills the
 * ticket (→ 0), pushes/voids drop out (×1), and a not-yet-started leg is neutral
 * (decimal × its implied prob ≈ 1). Fully transparent, no hidden haircut beyond
 * the shown margin.
 */
export function cashOutValue(ticket: Ticket, events: GameEvent[]): number {
  if (ticket.status !== 'open') return 0
  const byId = new Map(events.map((e) => [e.id, e]))

  let factor = 1
  let active = false // at least one leg is live or decided
  for (const leg of ticket.legs) {
    const e = byId.get(leg.eventId)
    if (!e) return 0
    if (e.status === 'final') {
      const outcome = gradeSelection(leg, e.score)
      if (outcome === 'loss') return 0
      if (outcome === 'win') factor *= decimalFromAmerican(leg.odds)
      // push / void → ×1 (leg drops out)
      active = true
    } else if (e.status === 'live') {
      factor *= decimalFromAmerican(leg.odds) * liveWinProb(leg, e)
      active = true
    } else {
      factor *= decimalFromAmerican(leg.odds) * impliedProbability(leg.odds) // ≈ 1, neutral
    }
  }
  if (!active) return 0
  return Math.max(0, Math.floor(ticket.stake * factor * (1 - CASHOUT_MARGIN)))
}

/** Cash out an open ticket at its current value, settling it through core. */
export function cashOutTicket(account: Account, ticket: Ticket, events: GameEvent[]): Ticket {
  if (ticket.status !== 'open') throw new Error(`ticket ${ticket.id} is not open`)
  const value = cashOutValue(ticket, events)
  if (value <= 0) throw new Error('this ticket cannot be cashed out right now')

  resolveAtMultiplier(account, ticket.wager, value / ticket.stake)
  ticket.status = 'cashed'
  ticket.returned = value
  return ticket
}
