/**
 * The bet-placement + settlement path — the bridge from the slip to the shared
 * money model (`core`). Placing a bet holds the stake in `pending` via
 * `placeWager`; settling releases the hold and moves the figure via `resolveWager`.
 * Every placed bet is recorded in the live-activity store (bets-store.ts) so it
 * shows up in pending/live activity and rolls into weekly figures + settlement —
 * because it runs through the SAME `core` Account every game uses.
 *
 *  // SEAM (figures/settlement): bets settle the player's `core` figure directly,
 *  so they already roll up Agent → Sub-Agent → Manager and are caught by weekly
 *  settlement (app/settlement-store) and the durable ledger (app/book-ledger) — no
 *  shared-file edit needed. Real score-driven grading is the FEED lane's job; here
 *  settlement is operator/simulated (forced outcomes), which is what the demo drives.
 *
 *  Correlated SGP: a same-game parlay is priced with correlation via `combinedDecimal`
 *  (slip.ts → lib/odds/pricing.priceSgp); contradictory legs are refused and the leg
 *  count is capped. Cash-out (`cashOutBookBet`) values the live position and settles it
 *  through core's `resolveAtMultiplier` — full, or partial (re-staking the remainder).
 *
 * Credit/balance only — integer cents through `core`. No cash, no cash value.
 */

import {
  availableToWager,
  placeWager,
  resolveAtMultiplier,
  resolveWager,
  type Account,
  type Outcome,
  type Wager,
} from '../../core/index.js'
import type { NormalizedEvent } from '../../lib/odds/contract.js'
import { getBook } from '../book-store.js'
import {
  combinedDecimal,
  contradictoryLegs,
  isSameGame,
  relatedConflicts,
  type SlipLeg,
  type SlipMode,
} from './slip.js'
import { SGP_MAX_LEGS } from '../../lib/odds/pricing.js'
import { cashOutMath, cashOutQuote } from './cashout.js'
import { toReturnCents } from './odds-format.js'
import {
  cashOutBetRecord,
  getBets,
  partialCashOutRecord,
  recordBet,
  settleBetRecord,
  type BookBet,
  type BookBetStatus,
} from './bets-store.js'

/** A placed bet's live core wager(s) + the account, kept in memory for settlement
 *  (pending is a live-session concept — a reload clears it, by book-store design). */
interface LiveBet {
  account: Account
  wager: Wager
  legs: SlipLeg[]
  mode: SlipMode
  decimal: number
}
const live = new Map<string, LiveBet>()

export interface PlaceBookBetInput {
  account: Account
  playerName: string
  placedBy: string
  legs: SlipLeg[]
  mode: SlipMode
  /** Per-leg stake (singles) or the one parlay stake — integer cents. */
  stakeCents: number
  now: number
}

/**
 * Place the slip. Validates the WHOLE outlay fits `availableToWager` before holding
 * anything (so a singles batch can't half-place), then routes through `core`:
 *  - parlay (≥2 legs): one wager at the combined price.
 *  - singles: one wager per leg, each its own bet in the activity list.
 * Returns the recorded bet(s). Throws (placing nothing) if the stake doesn't fit,
 * the parlay has related-contingency conflicts, or the slip is empty.
 */
export function placeBookBet(input: PlaceBookBetInput): BookBet[] {
  const { account, playerName, placedBy, legs, mode, stakeCents, now } = input
  if (legs.length === 0) throw new Error('add a selection first')
  if (!Number.isInteger(stakeCents) || stakeCents <= 0) throw new Error('enter a stake')

  const isParlay = mode === 'parlay' && legs.length >= 2
  if (isParlay) {
    if (relatedConflicts(legs).length > 0 || contradictoryLegs(legs).length > 0) {
      throw new Error('related or contradictory selections can’t be combined in a parlay')
    }
    if (isSameGame(legs) && legs.length > SGP_MAX_LEGS) {
      throw new Error(`a same-game parlay is limited to ${SGP_MAX_LEGS} legs`)
    }
  }

  const totalOutlay = isParlay ? stakeCents : stakeCents * legs.length
  if (totalOutlay > availableToWager(account)) {
    throw new Error('stake exceeds available to wager')
  }

  if (isParlay) {
    const { decimal } = combinedDecimal(legs)
    const wager = placeWager(account, stakeCents)
    const bet: BookBet = {
      id: wager.id,
      accountId: account.id,
      playerName,
      placedBy,
      mode: 'parlay',
      legs,
      stakeCents,
      decimal,
      status: 'open',
      placedAt: now,
    }
    live.set(bet.id, { account, wager, legs, mode: 'parlay', decimal })
    recordBet(bet)
    return [bet]
  }

  // singles — one bet per leg
  const placed: BookBet[] = []
  for (const leg of legs) {
    const wager = placeWager(account, stakeCents)
    const bet: BookBet = {
      id: wager.id,
      accountId: account.id,
      playerName,
      placedBy,
      mode: 'single',
      legs: [leg],
      stakeCents,
      decimal: leg.price.decimal,
      status: 'open',
      placedAt: now,
    }
    live.set(bet.id, { account, wager, legs: [leg], mode: 'single', decimal: leg.price.decimal })
    recordBet(bet)
    placed.push(bet)
  }
  return placed
}

const STATUS_BY_OUTCOME: Record<Outcome, BookBetStatus> = {
  win: 'won',
  loss: 'lost',
  push: 'push',
  void: 'void',
}

/**
 * Settle a placed bet through `core`, forcing each leg's outcome (operator/simulated
 * grading — the real score feed is the other lane). Parlay rules per CLAUDE.md §4:
 * any losing leg loses the parlay; void/push legs drop out and the parlay RE-PRICES on
 * the survivors (down to a straight bet, or a full void if none remain).
 *
 * `legOutcomes` maps a leg key → outcome; any leg left out defaults to 'win'. Returns
 * the final status, or null if the bet is unknown/already settled.
 */
export function settleBookBet(
  betId: string,
  legOutcomes: Record<string, Outcome>,
  now: number,
): BookBetStatus | null {
  const lb = live.get(betId)
  if (!lb || lb.wager.status === 'resolved') return null
  const { account, wager, legs } = lb

  const outcomeOf = (leg: SlipLeg): Outcome => legOutcomes[leg.key] ?? 'win'

  let outcome: Outcome
  let decimal = lb.decimal
  if (lb.mode === 'single') {
    outcome = outcomeOf(legs[0])
  } else {
    const results = legs.map(outcomeOf)
    if (results.includes('loss')) {
      outcome = 'loss'
    } else {
      // drop void/push legs, re-price on the winners (an SGP re-prices its survivors
      // with correlation too; a lone survivor is just its own decimal)
      const survivors = legs.filter((l) => outcomeOf(l) === 'win')
      if (survivors.length === 0) {
        outcome = 'void'
      } else {
        decimal =
          survivors.length >= 2 ? combinedDecimal(survivors).decimal : survivors[0].price.decimal
        outcome = decimal > 1 ? 'win' : 'push'
      }
    }
  }

  // A win needs a > 1 multiplier; anything else returns the stake or takes it.
  if (outcome === 'win' && decimal > 1) {
    resolveWager(account, wager, 'win', decimal)
  } else if (outcome === 'loss') {
    resolveWager(account, wager, 'loss')
  } else {
    resolveWager(account, wager, outcome === 'win' ? 'push' : outcome) // push/void return the stake
  }

  const status = STATUS_BY_OUTCOME[outcome]
  const returnCents =
    outcome === 'win' ? toReturnCents(wager.stake, decimal) : outcome === 'loss' ? 0 : wager.stake // push / void: stake returned
  settleBetRecord(betId, status, returnCents, now)
  live.delete(betId)
  return status
}

export interface CashOutResult {
  /** Cash realized to the figure on this cash-out (cents). */
  cashedValueCents: number
  /** Stake still live after the cash-out (0 when fully closed). */
  keptStakeCents: number
  /** True for a full cash-out; false when a remainder is left riding (partial). */
  fullyClosed: boolean
}

/**
 * Cash out an open book bet at its current live value, through the shared `core`.
 *
 * Full (`fraction` 1/omitted): the whole wager resolves at the offer via
 * `resolveAtMultiplier` (m = offer/stake), so the figure moves by offer − stake; status
 * → 'cashed'. Partial (0 < fraction < 1): the original wager resolves at a multiplier that
 * moves the figure by exactly the cashed portion's P/L, and the kept stake is RE-PLACED as
 * a fresh wager at the same price, so it keeps riding and settles normally later.
 *
 * Returns null when the bet is unknown, already settled, or not currently cashable (a leg
 * dropped off the live board). Credit/balance only — integer cents through `core`.
 */
export function cashOutBookBet(
  betId: string,
  events: NormalizedEvent[],
  opts: { fraction?: number; margin?: number; now: number },
): CashOutResult | null {
  const lb = live.get(betId)
  const rec = getBets().find((b) => b.id === betId)
  if (!lb || !rec || lb.wager.status === 'resolved' || rec.status !== 'open') return null

  const quote = cashOutQuote(rec, events, opts.margin)
  if (!quote.cashable) return null

  const { cashedValueCents, keptStakeCents, multiplier } = cashOutMath(
    quote.offerCents,
    lb.wager.stake,
    opts.fraction ?? 1,
  )
  resolveAtMultiplier(lb.account, lb.wager, multiplier)

  if (keptStakeCents > 0) {
    // partial: re-stake the remainder so it keeps riding; the bet stays open.
    const kept = placeWager(lb.account, keptStakeCents)
    live.set(betId, { ...lb, wager: kept })
    partialCashOutRecord(betId, keptStakeCents, cashedValueCents, opts.now)
    return { cashedValueCents, keptStakeCents, fullyClosed: false }
  }

  live.delete(betId)
  cashOutBetRecord(betId, cashedValueCents, opts.now)
  return { cashedValueCents, keptStakeCents: 0, fullyClosed: true }
}

/** The account a player's bets move (the live `core` Account in the book). */
export function accountFor(playerId: string): Account | null {
  return getBook().members[playerId]?.account ?? null
}

/** Clear placement's in-memory wager refs (tests). */
export function __resetPlacement(): void {
  live.clear()
}
