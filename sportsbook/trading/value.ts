/**
 * Bet value & staking analytics (CLAUDE.md §4).
 *
 * Given a FAIR probability for an outcome (a model's, or devigged from a sharp
 * source via `margin.ts`) and the decimal price on offer, these answer the
 * questions a trader and a bettor both care about:
 *
 *  - is the price +EV, and by how much?        → `expectedValue` / `isValueBet`
 *  - what win rate does the price need?         → `breakEvenProbability`
 *  - how much of the bankroll should I stake?   → `kellyFraction` / `kellyStake`
 *  - after the fact, did I beat the close?      → `closingLineValue`
 *
 * Pure functions on plain numbers. EV is expressed per 1 unit staked, matching
 * how `core` settles (profit = stake × (decimal − 1) on a win).
 */

function assertPrice(p: number, decimal: number): void {
  if (!(p > 0 && p < 1) || !Number.isFinite(p)) throw new Error(`probability must be in (0,1), got ${p}`)
  if (!(decimal > 1) || !Number.isFinite(decimal)) throw new Error(`decimal odds must be > 1, got ${decimal}`)
}

/**
 * Expected profit per 1 unit staked at `decimal`, when the true win probability
 * is `p`. A winning bet nets `decimal − 1`; a loss costs the unit:
 *
 *   EV = p · (decimal − 1) − (1 − p) = p · decimal − 1
 *
 * At a fair price (`decimal = 1/p`) EV is exactly 0; a longer price is +EV.
 */
export function expectedValue(p: number, decimal: number): number {
  assertPrice(p, decimal)
  return p * decimal - 1
}

/** The bettor's edge as a fraction of stake — the same number as `expectedValue`,
 *  named for the bettor's-eye view. Positive ⇒ a value bet. */
export function edge(p: number, decimal: number): number {
  return expectedValue(p, decimal)
}

/** True when the offered price is +EV against the fair probability. */
export function isValueBet(p: number, decimal: number): boolean {
  return expectedValue(p, decimal) > 0
}

/** The win probability a price needs just to break even: 1 / decimal. */
export function breakEvenProbability(decimal: number): number {
  if (!(decimal > 1)) throw new Error(`decimal odds must be > 1, got ${decimal}`)
  return 1 / decimal
}

/**
 * The full-Kelly stake fraction of bankroll for a `p`-likely bet at `decimal`:
 *
 *   f* = (b·p − q) / b ,  with b = decimal − 1,  q = 1 − p
 *      = EV / (decimal − 1)
 *
 * Clamped to ≥ 0 (a −EV edge stakes nothing). `kellyMultiplier` scales it for
 * fractional Kelly (e.g. 0.5 = half-Kelly), the usual real-world choice since
 * full Kelly is high-variance.
 */
export function kellyFraction(p: number, decimal: number, kellyMultiplier = 1): number {
  assertPrice(p, decimal)
  if (!(kellyMultiplier >= 0)) throw new Error(`kellyMultiplier must be ≥ 0, got ${kellyMultiplier}`)
  const b = decimal - 1
  const f = (b * p - (1 - p)) / b
  return Math.max(0, f) * kellyMultiplier
}

/** The Kelly stake in points: `bankroll × kellyFraction`. */
export function kellyStake(p: number, decimal: number, bankroll: number, kellyMultiplier = 1): number {
  if (!(bankroll >= 0)) throw new Error(`bankroll must be ≥ 0, got ${bankroll}`)
  return bankroll * kellyFraction(p, decimal, kellyMultiplier)
}

/**
 * Closing-line value: the bet's expected value measured against the CLOSING fair
 * probability (the sharpest read of the true price). A positive CLV means you
 * got a better number than the close — the single best long-run signal that a
 * bet was good, independent of whether it won.
 *
 *   CLV = closeFairProbability · betDecimal − 1
 */
export function closingLineValue(betDecimal: number, closeFairProbability: number): number {
  return expectedValue(closeFairProbability, betDecimal)
}
