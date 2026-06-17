/**
 * Tail / fade — the social action that moves credits. CRITICAL: a tail/fade is NOT a new
 * money path and NOT a copy of a number — it PLACES A REAL BET through the existing book
 * placement path (`placeBookBet` → core.placeWager), so it respects the player's own
 * balance, credit limit, max/min bet and betting lock exactly like any other bet, holds the
 * stake in `pending`, and rolls into figures + settlement.
 *
 *  - TAIL: copy a friend's slip (same legs, same mode) onto your own slip and place it.
 *  - FADE: place the OPPOSITE single (home↔away, over↔under) at its CURRENT price from the
 *    live slate. Only defined for a single-leg slip — a parlay has no single "opposite".
 *
 * Pricing is never touched here: fade reads the opposite selection from the slate and uses
 * the book's own `legFromSelection` to lock its current `priceDisplay`.
 */

import type { Account } from '../core/index.js'
import type { NormalizedEvent } from '../lib/odds/contract.js'
import { legFromSelection, type SlipLeg } from '../app/book/slip.js'
import { placeBookBet } from '../app/book/placement.js'
import type { BookBet } from '../app/book/bets-store.js'
import type { SharedSlip } from './types.js'

/** Directly-opposing sides (the fade target). */
const OPPOSITE_SIDE: Readonly<Record<string, string>> = {
  over: 'under',
  under: 'over',
  home: 'away',
  away: 'home',
  yes: 'no',
  no: 'yes',
}

/** The opposing side of a selection, or null if it has no clean opposite (e.g. a future). */
export function oppositeSide(side: string): string | null {
  return OPPOSITE_SIDE[side] ?? null
}

/** A spread fades to the mirrored line (home −3.5 ↔ away +3.5); totals/props keep the line. */
function mirroredLine(leg: SlipLeg): number | undefined {
  if (leg.line === undefined) return undefined
  return leg.marketType === 'spread' ? -leg.line : leg.line
}

/**
 * The opposite leg to a given leg, built from the CURRENT slate (so it locks the live
 * opposite price). Returns null when the event/market/opposite-selection isn't on the board
 * — i.e. there's nothing to fade.
 */
export function oppositeLeg(leg: SlipLeg, slate: readonly NormalizedEvent[]): SlipLeg | null {
  const opp = oppositeSide(leg.side)
  if (!opp) return null
  const event = slate.find((e) => e.eventId === leg.eventId)
  if (!event) return null
  const market = event.markets.find((m) => m.marketId === leg.marketId)
  if (!market) return null
  const wantLine = mirroredLine(leg)
  const sel = market.selections.find(
    (s) => s.side === opp && (wantLine === undefined || (s.line ?? undefined) === wantLine),
  )
  if (!sel || !sel.available) return null
  return legFromSelection(event, market, sel)
}

/** Whether a slip can be faded: a single-leg slip with an opposite selection on the board. */
export function canFade(slip: SharedSlip, slate: readonly NormalizedEvent[]): boolean {
  return slip.legs.length === 1 && oppositeLeg(slip.legs[0], slate) !== null
}

export interface TailInput {
  slip: SharedSlip
  /** YOUR core account — the bet moves your figure, respecting your limits. */
  account: Account
  playerName: string
  /** YOUR stake (integer cents) — not copied from the friend; your own bankroll. */
  stakeCents: number
  now: number
}

/**
 * Tail a slip: place a REAL bet with the SAME legs + mode through the book placement path.
 * Throws (placing nothing) if the stake doesn't fit your availableToWager / max bet / lock,
 * exactly as a normal placement would. Returns the placed BookBet(s).
 */
export function tailSlip(input: TailInput): BookBet[] {
  const { slip, account, playerName, stakeCents, now } = input
  return placeBookBet({
    account,
    playerName,
    placedBy: playerName,
    legs: slip.legs,
    mode: slip.mode,
    stakeCents,
    now,
  })
}

export interface FadeInput extends TailInput {
  /** The live slate — fade reads the opposite selection's current price from it. */
  slate: readonly NormalizedEvent[]
}

/**
 * Fade a slip: place the OPPOSITE single at its current price. Only valid for a single-leg
 * slip with an opposite on the board (throws otherwise). Routes through the same placement
 * path → core, so your limits/balance are respected. Returns the placed BookBet(s).
 */
export function fadeSlip(input: FadeInput): BookBet[] {
  const { slip, account, playerName, slate, stakeCents, now } = input
  if (slip.legs.length !== 1) throw new Error('fade is only available on single bets')
  const opp = oppositeLeg(slip.legs[0], slate)
  if (!opp) throw new Error('no opposite selection is available to fade')
  return placeBookBet({
    account,
    playerName,
    placedBy: playerName,
    legs: [opp],
    mode: 'single',
    stakeCents,
    now,
  })
}
