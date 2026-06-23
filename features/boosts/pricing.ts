/**
 * Pure boost pricing. An ODDS boost improves a slip's price: the displayed decimal rises and, on
 * a win, the player is paid the improved line. To keep value flowing ONLY through the engine, the
 * bet is placed at the TRUE price and the line-improvement uplift (return × pct%) is GRANTED at
 * settlement — so total paid = true return + uplift = improved-line return, exactly.
 *
 * The uplift is computed with the SAME rounding the bonus engine uses for a `profit-boost` reward
 * (`Math.round(base × pct / 100)`), so the displayed boosted line and the line actually paid never
 * drift by a cent. No money moves here.
 */

import { toReturnCents } from '../../app/book/odds-format.js'

/** The uplift the engine will grant for `pct`% of a base (cents). Mirrors rawRewardCents. */
export function upliftCents(baseCents: number, pct: number): number {
  return Math.max(0, Math.round((Math.max(0, baseCents) * pct) / 100))
}

export interface BoostedQuote {
  stakeCents: number
  baseDecimal: number
  /** The decimal the boosted line actually pays (boostedReturn / stake) — for display. */
  boostedDecimal: number
  /** True-price return (what core pays on the placed bet). */
  baseReturnCents: number
  /** Improved-line return = baseReturn + uplift (what the player nets in total). */
  boostedReturnCents: number
  /** The grant issued at settlement = boostedReturn − baseReturn = return × pct%. */
  upliftCents: number
}

/**
 * Price an odds-boosted slip: from the true combined decimal + stake, the improved decimal, the
 * true and boosted returns, and the uplift granted at settlement. `boostedReturn` and
 * `boostedDecimal` are derived FROM the uplift so they reconcile to what's actually paid.
 */
export function boostedQuote(stakeCents: number, baseDecimal: number, pct: number): BoostedQuote {
  const baseReturnCents = toReturnCents(stakeCents, baseDecimal)
  const uplift = upliftCents(baseReturnCents, pct)
  const boostedReturnCents = baseReturnCents + uplift
  const boostedDecimal = stakeCents > 0 ? boostedReturnCents / stakeCents : baseDecimal
  return {
    stakeCents,
    baseDecimal,
    boostedDecimal,
    baseReturnCents,
    boostedReturnCents,
    upliftCents: uplift,
  }
}
