/**
 * Cash-out VALUE math for the book — pure, framework-agnostic.
 *
 * A live cash-out offer is the bet's CURRENT win probability × its potential payout, minus
 * a house cash-out margin. It's an engagement feature AND a second margin event (the house
 * holds a little on the way out, same as on the way in), so the margin is baked in here.
 * Win probability is read from the CURRENT slate and de-vigged, so a bet drifting toward a
 * win is worth more and toward a loss less; a same-game parlay re-uses the SGP correlation.
 *
 * This file only VALUES a cash-out. The settlement (moving the figure) runs through the
 * shared `core` in placement.cashOutBookBet — credit/balance only, integer cents.
 */

import type { NormalizedEvent } from '../../lib/odds/contract.js'
import { correlatedJoint, correlationForSport, devig } from '../../lib/odds/pricing.js'
import { toReturnCents } from './odds-format.js'
import type { BookBet } from './bets-store.js'
import type { SlipLeg } from './slip.js'

/** House margin baked into a cash-out offer — a second hold on top of the bet's margin. */
export const DEFAULT_CASHOUT_MARGIN = 0.08

export interface CashOutQuote {
  /** The current cash-out offer for the bet's live stake, in integer cents. */
  offerCents: number
  /** Potential return if the bet rides and wins (stake × decimal). */
  potentialReturnCents: number
  /** The combined current win probability used (0..1). */
  winProbability: number
  /** False when the bet can't be cashed (already settled, or a leg's market is gone). */
  cashable: boolean
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** A leg's CURRENT de-vigged win probability from the live slate, or null if its market/
 *  line is no longer offered (then the bet can't be priced → not cashable). Mirrors the
 *  add-time de-vig in slip.legFromSelection, but off the LIVE prices, not the locked ones. */
export function liveLegWinProbability(leg: SlipLeg, events: NormalizedEvent[]): number | null {
  const ev = events.find((e) => e.eventId === leg.eventId)
  const market = ev?.markets.find((m) => m.marketId === leg.marketId)
  if (!market) return null
  const line = leg.line ?? null
  const pool = market.selections.filter((x) => (x.line ?? null) === line)
  const group = pool.length >= 1 ? pool : market.selections
  const idx = group.findIndex((x) => x.selectionId === leg.key)
  if (idx < 0) return null
  return devig(group.map((x) => x.priceRaw.american))[idx]
}

/**
 * The combined CURRENT win probability across a bet's legs:
 *  - single: the lone leg's probability,
 *  - same-game parlay: the legs combined WITH correlation (the SGP model),
 *  - cross-game parlay: the independent product.
 * Returns null if any leg can't be priced from the live slate (suspended / pulled).
 */
export function liveWinProbability(bet: BookBet, events: NormalizedEvent[]): number | null {
  const probs: number[] = []
  for (const leg of bet.legs) {
    const p = liveLegWinProbability(leg, events)
    if (p == null) return null
    probs.push(p)
  }
  if (probs.length === 1) return probs[0]
  const sameGame = bet.legs.every((l) => l.eventId === bet.legs[0].eventId)
  if (sameGame) return correlatedJoint(probs, correlationForSport(bet.legs[0].sport))
  return probs.reduce((acc, p) => acc * p, 1)
}

/** Value a cash-out of an OPEN bet from the live slate: win-prob × potential payout, less
 *  the cash-out margin, clamped to [0, potential return]. Not cashable once settled or if
 *  any leg has dropped off the board. */
export function cashOutQuote(
  bet: BookBet,
  events: NormalizedEvent[],
  margin: number = DEFAULT_CASHOUT_MARGIN,
): CashOutQuote {
  const potentialReturnCents = toReturnCents(bet.stakeCents, bet.decimal)
  if (bet.status !== 'open') {
    return { offerCents: 0, potentialReturnCents, winProbability: 0, cashable: false }
  }
  const p = liveWinProbability(bet, events)
  if (p == null) {
    return { offerCents: 0, potentialReturnCents, winProbability: 0, cashable: false }
  }
  const offer = Math.round(potentialReturnCents * p * (1 - clamp(margin, 0, 0.5)))
  const offerCents = clamp(offer, 0, potentialReturnCents)
  return { offerCents, potentialReturnCents, winProbability: p, cashable: offerCents > 0 }
}

export interface CashOutMath {
  /** Cash returned now for the cashed portion (integer cents). */
  cashedValueCents: number
  /** Stake that stays live after a partial cash-out (0 for a full cash-out). */
  keptStakeCents: number
  /**
   * The multiplier to resolve the ORIGINAL wager at via core.resolveAtMultiplier. Chosen
   * so the figure moves by EXACTLY the cashed portion's P/L (cashedValue − cashedStake);
   * the kept stake is then re-placed as a fresh wager (see placement.cashOutBookBet).
   */
  multiplier: number
}

/**
 * The integer-cents math for cashing a FRACTION (0 < f ≤ 1) of a bet at `offerCents`.
 * Full cash-out (f = 1): the whole stake is closed at the offer. Partial: only `f` of the
 * stake is cashed now; the rest rides on the original price. Pure — no money moves here.
 */
export function cashOutMath(offerCents: number, stakeCents: number, fraction: number): CashOutMath {
  const f = clamp(fraction, 0, 1)
  const cashedStakeCents = f >= 1 ? stakeCents : Math.round(stakeCents * f)
  const keptStakeCents = stakeCents - cashedStakeCents
  const cashedValueCents = f >= 1 ? offerCents : Math.round(offerCents * f)
  // resolveAtMultiplier moves balance by stake×(m−1); we want exactly (cashedValue − cashedStake).
  const multiplier = stakeCents > 0 ? 1 + (cashedValueCents - cashedStakeCents) / stakeCents : 0
  return { cashedValueCents, keptStakeCents, multiplier }
}
