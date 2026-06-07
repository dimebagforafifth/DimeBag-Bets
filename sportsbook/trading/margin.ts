/**
 * Margin & devigging — the bookmaker's read on a market (CLAUDE.md §4).
 *
 * A posted market's decimal prices carry the book's margin: the vig-inclusive
 * implied probabilities (1/decimal) sum to MORE than 1. That sum is the
 * **overround**; the excess is the **margin** (the "juice"). To recover the
 * book's true view of each outcome you "devig" — strip the margin back out so
 * the probabilities sum to 1.
 *
 * Three standard devig methods are provided; they differ in how they distribute
 * the margin across favourites vs. longshots:
 *  - `proportional` — normalise (p_i = q_i / Σq). Margin spread in proportion to
 *    each implied prob. Simple, the usual default.
 *  - `power`        — find k with Σ q_i^k = 1; p_i = q_i^k. Corrects the
 *    favourite–longshot bias (takes more margin off longshots).
 *  - `shin`         — Shin's model: assumes a fraction `z` of "informed" money
 *    and solves for it. Sits between the other two; widely used by sharp books.
 *
 * Everything works on decimal prices; American-input wrappers are at the bottom.
 * Pure functions — no event/ticket coupling, so they're trivially testable.
 */

import { decimalFromAmerican } from '../odds.js'

export type DevigMethod = 'proportional' | 'power' | 'shin'

function assertMarket(decimals: number[]): void {
  if (decimals.length < 2) throw new Error(`a market needs ≥2 outcomes, got ${decimals.length}`)
  for (const d of decimals) {
    if (!(d > 1) || !Number.isFinite(d)) throw new Error(`every decimal price must be > 1, got ${d}`)
  }
}

/** A decimal price's vig-inclusive implied probability: 1 / decimal. */
export function impliedFromDecimal(decimal: number): number {
  if (!(decimal > 1)) throw new Error(`decimal must be > 1, got ${decimal}`)
  return 1 / decimal
}

/**
 * Overround ("book percentage"): the sum of implied probabilities across every
 * outcome. A perfectly fair market sums to exactly 1.0; anything above is vig.
 */
export function overround(decimals: number[]): number {
  assertMarket(decimals)
  return decimals.reduce((s, d) => s + 1 / d, 0)
}

/** Total book margin = overround − 1 (e.g. 0.045 = a 4.5% market). */
export function bookMargin(decimals: number[]): number {
  return overround(decimals) - 1
}

/**
 * Theoretical hold: the share of total stakes the book expects to keep when
 * money comes in proportional to each outcome's FAIR probability — `1 − 1/overround`
 * (equivalently `margin / overround`), always a touch below the raw margin. (If
 * instead stakes match the posted implied probabilities exactly, the realised
 * hold equals the margin; see `book.expectedHold` for the position-specific value.)
 */
export function theoreticalHold(decimals: number[]): number {
  return 1 - 1 / overround(decimals)
}

/**
 * Root of a strictly-decreasing `f` (callers pass an `f` with `f(lo) > 0` that
 * crosses zero). Expand the upper bound until `f(hi) ≤ 0`, then bisect with an
 * early stop once the bracket is below float precision.
 */
function solveDecreasing(f: (x: number) => number, lo = 1e-6, hiStart = 1): number {
  let hi = hiStart
  let guard = 0
  while (f(hi) > 0 && guard++ < 200) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > 0) lo = mid
    else hi = mid
    if (hi - lo < 1e-15) break
  }
  return (lo + hi) / 2
}

function normalise(xs: number[]): number[] {
  const s = xs.reduce((a, b) => a + b, 0)
  return xs.map((x) => x / s)
}

/** Proportional devig: p_i = q_i / Σq. */
export function devigProportional(decimals: number[]): number[] {
  assertMarket(decimals)
  return normalise(decimals.map((d) => 1 / d))
}

/**
 * Power devig: solve for the exponent k where Σ (1/d_i)^k = 1, then p_i = q_i^k.
 * Because every q_i ∈ (0,1), Σ q_i^k strictly decreases in k, so the root is
 * unique. With vig present (Σq > 1) the root is k > 1, which shrinks longshots
 * harder than favourites — the favourite–longshot correction.
 */
export function devigPower(decimals: number[]): number[] {
  assertMarket(decimals)
  const q = decimals.map((d) => 1 / d)
  const k = solveDecreasing((kk) => q.reduce((s, x) => s + Math.pow(x, kk), 0) - 1)
  return normalise(q.map((x) => Math.pow(x, k))) // normalise away tiny residual
}

/**
 * Shin devig. Models the market as a mix of "uninformed" bettors and a fraction
 * `z` of insiders, and recovers the probabilities that imply the observed prices
 * under that mix:
 *
 *   p_i(z) = ( √(z² + 4(1−z) · q_i² / Σq) − z ) / ( 2(1−z) )
 *
 * `z` is chosen so Σ p_i(z) = 1. `g(z) = Σ p_i(z) − 1` is decreasing on [0,1)
 * with g(0) = √(Σq) − 1 > 0, so a unique root is found by bisection.
 */
export function devigShin(decimals: number[]): number[] {
  assertMarket(decimals)
  const q = decimals.map((d) => 1 / d)
  const O = q.reduce((a, b) => a + b, 0)
  const pAt = (z: number): number[] =>
    q.map((qi) => (Math.sqrt(z * z + (4 * (1 - z) * qi * qi) / O) - z) / (2 * (1 - z)))
  const g = (z: number) => pAt(z).reduce((a, b) => a + b, 0) - 1

  // bisect for z ∈ [0, 0.99]: g(0) > 0, g decreasing. The upper bound stays well
  // clear of the 2(1−z) singularity (insider fraction z is tiny in practice,
  // well under 0.3 even for fat markets), avoiding cancellation near z = 1.
  let lo = 0
  let hi = 0.99
  if (g(hi) > 0) return devigProportional(decimals) // no vig / degenerate → fall back
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (g(mid) > 0) lo = mid
    else hi = mid
  }
  return normalise(pAt((lo + hi) / 2))
}

/** Devig a market to fair probabilities (sum = 1) by the chosen method. */
export function fairProbabilities(decimals: number[], method: DevigMethod = 'proportional'): number[] {
  switch (method) {
    case 'power':
      return devigPower(decimals)
    case 'shin':
      return devigShin(decimals)
    default:
      return devigProportional(decimals)
  }
}

/** Fair, no-vig decimal odds (1 / fair prob) for each outcome. */
export function fairDecimalOdds(decimals: number[], method: DevigMethod = 'proportional'): number[] {
  return fairProbabilities(decimals, method).map((p) => 1 / p)
}

/* ----------------------------- American wrappers ----------------------------- */

/** Overround from American prices. */
export function overroundAmerican(americanPrices: number[]): number {
  return overround(americanPrices.map(decimalFromAmerican))
}

/** Book margin from American prices. */
export function bookMarginAmerican(americanPrices: number[]): number {
  return bookMargin(americanPrices.map(decimalFromAmerican))
}

/** Fair probabilities from American prices. */
export function fairProbabilitiesAmerican(
  americanPrices: number[],
  method: DevigMethod = 'proportional',
): number[] {
  return fairProbabilities(americanPrices.map(decimalFromAmerican), method)
}

/** A one-call summary of a market's vig and the book's fair read of it. */
export interface MarketReport {
  overround: number
  margin: number
  hold: number
  fairProbabilities: number[]
  fairDecimals: number[]
}

export function marketReport(decimals: number[], method: DevigMethod = 'proportional'): MarketReport {
  const fair = fairProbabilities(decimals, method)
  return {
    overround: overround(decimals),
    margin: bookMargin(decimals),
    hold: theoreticalHold(decimals),
    fairProbabilities: fair,
    fairDecimals: fair.map((p) => 1 / p),
  }
}
