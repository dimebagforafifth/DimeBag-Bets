/**
 * The over/under line engine (CLAUDE.md §4).
 *
 * One model powers player props, totals, AND spreads: a quantity `Q` (player
 * stat / combined score / home margin) is modeled as Normal(mean, sd), and a bet
 * is "over" or "under" a line. From that we read the cover probability, price
 * both sides (reusing the trading desk's `twoWayPrices`), build an alternate-line
 * ladder, and grade the result.
 *
 *  - total:  Q = home + away,  line = the posted total
 *  - prop:   Q = player stat,  line = the prop number, mean = the projection
 *  - spread: Q = home − away (the margin), line = the favourite's number
 *
 * Pure functions composing `props/distribution` and `sportsbook/trading`.
 */

import { normalSf } from './distribution.js'
import { twoWayPrices, type PricedOutcome } from '../trading/pricing.js'

export type OverUnder = 'over' | 'under'

/** P(Q > line) for Q ~ Normal(mean, sd) — the chance the OVER cashes. */
export function overProbability(mean: number, sd: number, line: number): number {
  return normalSf(line, mean, sd)
}

export interface PricedLine {
  line: number
  /** Fair probability the over cashes. */
  pOver: number
  over: PricedOutcome
  under: PricedOutcome
}

/**
 * Price one line: derive the over probability from the model, then post over/under
 * prices with the target margin via the trading desk's two-way pricer.
 */
export function priceLine(mean: number, sd: number, line: number, targetMargin = 0.05): PricedLine {
  if (!(sd > 0)) throw new Error(`sd must be > 0, got ${sd}`)
  const pOver = clampProb(overProbability(mean, sd, line))
  const [over, under] = twoWayPrices(pOver, targetMargin)
  return { line, pOver, over, under }
}

/**
 * An alternate-line ladder: price every line in `lines` off the same model, so a
 * book can offer a range (e.g. an alt total at 210/215/220/225/230). The over
 * price lengthens as the line rises — a built-in monotonicity the tests pin.
 */
export function altLineLadder(
  mean: number,
  sd: number,
  lines: number[],
  targetMargin = 0.05,
): PricedLine[] {
  return [...lines].sort((a, b) => a - b).map((line) => priceLine(mean, sd, line, targetMargin))
}

/**
 * Grade an over/under bet. A whole-number line can land exactly on the quantity
 * and push; a half-point line never can.
 */
export function gradeOverUnder(line: number, pick: OverUnder, actual: number): 'win' | 'loss' | 'push' {
  if (actual === line) return 'push'
  const wentOver = actual > line
  return (pick === 'over') === wentOver ? 'win' : 'loss'
}

/** Keep a modelled probability strictly inside (0,1) so pricing never blows up
 *  on an extreme line. */
function clampProb(p: number): number {
  return Math.min(0.999, Math.max(0.001, p))
}
