/**
 * Odds-format conversions for the trading layer (CLAUDE.md §4).
 *
 * `sportsbook/odds.ts` already owns American ↔ decimal (the formats the book
 * publishes and the money model settles on). This file ADDS the conversions a
 * trader reaches for — probability ↔ decimal, fractional ↔ decimal, and the
 * "no-vig" (fair) price — without touching that stable surface. It reuses
 * `odds.ts` for the American work so there's one source of truth per conversion.
 *
 * Pure number work: a decimal of 2.50 means a winning unit returns 2.50 (stake
 * × 2.50), which is exactly the `payoutMultiplier` core grades a win at (§3).
 */

import { americanFromDecimal, decimalFromAmerican } from '../odds.js'

export { americanFromDecimal, decimalFromAmerican }

/** A decimal price's (vig-inclusive) implied probability: 1 / decimal. */
export function probabilityFromDecimal(decimal: number): number {
  if (!(decimal > 1)) throw new Error(`decimal odds must be > 1, got ${decimal}`)
  return 1 / decimal
}

/** A probability's fair decimal price: 1 / p. Throws outside (0, 1). */
export function decimalFromProbability(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error(`probability must be in (0, 1), got ${p}`)
  return 1 / p
}

/** A probability's fair American price (no vig). */
export function americanFromProbability(p: number): number {
  return americanFromDecimal(decimalFromProbability(p))
}

/** Fractional odds "a/b" → decimal: a winning unit returns 1 + a/b. */
export function decimalFromFractional(numerator: number, denominator: number): number {
  if (!(numerator > 0) || !(denominator > 0)) {
    throw new Error(`fractional odds need positive numerator and denominator, got ${numerator}/${denominator}`)
  }
  return 1 + numerator / denominator
}

/**
 * Decimal → fractional, reduced to whole numbers. 2.50 → "3/2", 1.91 → "91/100".
 * Uses the GCD of the scaled profit so the fraction is in lowest terms.
 */
export function fractionalFromDecimal(decimal: number, maxDenominator = 1000): [number, number] {
  if (!(decimal > 1)) throw new Error(`decimal odds must be > 1, got ${decimal}`)
  const profit = decimal - 1
  // best rational approximation of `profit` with denominator ≤ maxDenominator
  let bestNum = 1
  let bestDen = 1
  let bestErr = Infinity
  for (let den = 1; den <= maxDenominator; den++) {
    // clamp the numerator to ≥1 rather than skipping: for a tiny profit (a heavy
    // favourite, decimal ≈ 1) round() is 0 for small denominators, and skipping
    // would leave the [1,1] default — a silently wrong 2.0. Clamping instead
    // returns the closest representable fraction within maxDenominator.
    const num = Math.max(1, Math.round(profit * den))
    const err = Math.abs(profit - num / den)
    if (err < bestErr - 1e-12) {
      bestErr = err
      bestNum = num
      bestDen = den
      if (err < 1e-12) break
    }
  }
  const g = gcd(bestNum, bestDen)
  return [bestNum / g, bestDen / g]
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b]
  return a || 1
}
