/**
 * Price-making — the inverse of devigging (CLAUDE.md §4).
 *
 * Given the book's fair probabilities for a market (from a model, or devigged
 * from a sharp source via `margin.ts`) and a target margin, post the prices the
 * book will actually offer. The margin is applied by raising each outcome's
 * implied probability so the overround lands on `1 + targetMargin`:
 *
 *  - `proportional` — q_i = p_i · (1 + margin).   Margin scaled to each prob.
 *  - `additive`     — q_i = p_i + margin / n.     Margin split evenly.
 *  - `power`        — q_i = p_i^k with Σ q_i = 1 + margin (k < 1). Loads more
 *                     margin onto longshots (the realistic book shape).
 *
 * Output carries the implied probability, the decimal price (1/q_i, the
 * `payoutMultiplier` core settles on), and the rounded American price.
 */

import { americanFromDecimal } from '../odds.js'

export type MarginMethod = 'proportional' | 'additive' | 'power'

export interface PricedOutcome {
  /** The posted, vig-inclusive implied probability (1 / decimal). */
  impliedProbability: number
  /** The fair probability this was priced from. */
  fairProbability: number
  decimal: number
  american: number
}

function assertProbs(probs: number[]): number[] {
  if (probs.length < 2) throw new Error(`a market needs ≥2 outcomes, got ${probs.length}`)
  for (const p of probs) {
    if (!(p > 0 && p < 1) || !Number.isFinite(p)) throw new Error(`fair probabilities must be in (0,1), got ${p}`)
  }
  // tolerate a small drift, then normalise so the input is a clean distribution
  const s = probs.reduce((a, b) => a + b, 0)
  if (Math.abs(s - 1) > 0.02) throw new Error(`fair probabilities must sum to ~1, got ${s.toFixed(4)}`)
  return probs.map((p) => p / s)
}

/** Root of a strictly-decreasing `f` (with `f(lo) > 0`), expanding then bisecting
 *  with an early stop once the bracket is below float precision. */
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

/** The posted implied probabilities for a market, given fair probs + margin. */
export function postedImpliedProbabilities(
  fairProbs: number[],
  targetMargin: number,
  method: MarginMethod = 'proportional',
): number[] {
  if (!(targetMargin >= 0)) throw new Error(`targetMargin must be ≥ 0, got ${targetMargin}`)
  const p = assertProbs(fairProbs)
  const n = p.length
  const target = 1 + targetMargin

  if (method === 'additive') {
    return p.map((pi) => pi + targetMargin / n)
  }
  if (method === 'power') {
    // Σ p_i^k = target, with target > 1 ⇒ k < 1 (Σ p^k increases as k falls).
    const k = solveDecreasing((kk) => p.reduce((s, pi) => s + Math.pow(pi, kk), 0) - target)
    return p.map((pi) => Math.pow(pi, k))
  }
  // proportional
  return p.map((pi) => pi * target)
}

/**
 * Make a full set of posted prices from fair probabilities and a target margin.
 * The posted overround equals `1 + targetMargin` (exact for proportional and
 * additive; solved to it for power).
 */
export function makePrices(
  fairProbs: number[],
  targetMargin: number,
  method: MarginMethod = 'proportional',
): PricedOutcome[] {
  const p = assertProbs(fairProbs)
  const q = postedImpliedProbabilities(p, targetMargin, method)
  return q.map((qi, i) => {
    const decimal = 1 / qi
    return {
      impliedProbability: qi,
      fairProbability: p[i],
      decimal,
      american: americanFromDecimal(decimal),
    }
  })
}

/**
 * Two-way convenience: price a home/away market from the home win probability
 * and a target margin. Returns `[home, away]`.
 */
export function twoWayPrices(
  homeProbability: number,
  targetMargin: number,
  method: MarginMethod = 'proportional',
): [PricedOutcome, PricedOutcome] {
  const [home, away] = makePrices([homeProbability, 1 - homeProbability], targetMargin, method)
  return [home, away]
}

/** The overround a priced set actually carries (a check on the target). */
export function pricedOverround(priced: PricedOutcome[]): number {
  return priced.reduce((s, o) => s + o.impliedProbability, 0)
}
