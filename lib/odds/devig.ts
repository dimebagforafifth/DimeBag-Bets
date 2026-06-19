/**
 * De-vigging — turning a market's RAW implied probabilities (which carry the book's overround,
 * so they sum to > 1) into TRUE probabilities that sum to 1 (SGO pricing pipeline, math half).
 *
 * Four standard methods, each a different theory of WHERE the vig sits:
 *   - multiplicative — proportional: every price is inflated by the same factor. trueProb_i =
 *                      π_i / Σπ. The simplest, and what the legacy `pricing.devig` already does.
 *   - additive       — equal share: the overround is split equally across selections. trueProb_i
 *                      = π_i − (Σπ − 1)/n. Can go negative on a skewed market → guarded.
 *   - power          — solve an exponent k with Σ π_i^k = 1, trueProb_i = π_i^k. THE DEFAULT;
 *                      sits between multiplicative and additive and never goes negative.
 *   - shin           — models the vig as protection against insider money. On a TWO-way market
 *                      it reduces to additive (by spec); general n-way uses the Shin solve.
 *
 * Pure + dependency-free. Every method runs through a final non-negative renormalise, so the
 * result is always a valid probability vector (sum 1, no negatives) even on a skewed book.
 */

export type DevigMethod = 'multiplicative' | 'additive' | 'power' | 'shin'

export const DEVIG_METHODS: readonly DevigMethod[] = ['multiplicative', 'additive', 'power', 'shin']

/** The default de-vig method — power sits between proportional and equal-share and is always
 *  non-negative, so it's the house-safe default. */
export const DEFAULT_DEVIG_METHOD: DevigMethod = 'power'

const EPS = 1e-12

/** Clamp negatives to zero and renormalise so the vector sums to 1 (a no-op for an already-
 *  valid vector). The single guard every method ends on, so a skewed market can't emit a
 *  negative probability. */
function normalize(probs: number[]): number[] {
  const safe = probs.map((p) => (Number.isFinite(p) && p > 0 ? p : 0))
  const sum = safe.reduce((a, b) => a + b, 0)
  if (sum <= 0) return safe
  return safe.map((p) => p / sum)
}

/** Proportional: divide out the overround evenly across the prices. */
function multiplicative(implied: number[]): number[] {
  return normalize(implied)
}

/** Equal share: subtract an equal slice of the overround from each selection. */
function additive(implied: number[]): number[] {
  const n = implied.length
  const over = implied.reduce((a, b) => a + b, 0) - 1
  return normalize(implied.map((p) => p - over / n))
}

/**
 * Power: find the exponent k that makes Σ π_i^k = 1 (bisection — Σπ_i^k is monotonically
 * decreasing in k for π_i ∈ (0,1), so the root is unique), then raise each price to it. Handles
 * both an overround (k > 1) and an underround (k < 1).
 */
function power(implied: number[]): number[] {
  const ps = implied.map((p) => Math.max(0, p))
  const sumAt = (k: number): number => ps.reduce((a, p) => a + (p > 0 ? Math.pow(p, k) : 0), 0)
  let lo = 1e-6
  let hi = 1e3
  // Expand hi until Σ drops below 1 (defensive; 1e3 is ample for any real market).
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (sumAt(mid) > 1) lo = mid
    else hi = mid
  }
  const k = (lo + hi) / 2
  return normalize(ps.map((p) => (p > 0 ? Math.pow(p, k) : 0)))
}

/**
 * Shin: solve for z (the modelled fraction of insider money) so the Shin probabilities
 *   trueProb_i = (√(z² + 4(1−z)·π_i²/B) − z) / (2(1−z)),  B = Σπ
 * sum to 1. Bisection on z ∈ [0, 1). Falls back to multiplicative on a non-overround book
 * (B ≤ 1, where Shin isn't defined). By spec a two-way (or smaller) market is just `additive`.
 */
function shin(implied: number[]): number[] {
  if (implied.length <= 2) return additive(implied)
  const B = implied.reduce((a, b) => a + b, 0)
  if (B <= 1) return multiplicative(implied)
  const shinProbs = (z: number): number[] =>
    implied.map((pi) => {
      const num = Math.sqrt(z * z + (4 * (1 - z) * pi * pi) / B) - z
      return num / (2 * (1 - z))
    })
  const sumAt = (z: number): number => shinProbs(z).reduce((a, b) => a + b, 0)
  // g(z) = Σ trueProb(z) − 1 is decreasing: g(0) = √B − 1 > 0, so bisect up.
  let lo = 0
  let hi = 1 - 1e-9
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (sumAt(mid) > 1) lo = mid
    else hi = mid
  }
  return normalize(shinProbs((lo + hi) / 2))
}

/**
 * De-vig a market's RAW implied probabilities into TRUE probabilities (sum 1) by the chosen
 * method. A 0-/1-selection market needs no de-vigging (returns [] / [1]). The result is always
 * non-negative and sums to 1. Pure.
 */
export function devig(impliedProbs: number[], method: DevigMethod = DEFAULT_DEVIG_METHOD): number[] {
  if (impliedProbs.length === 0) return []
  if (impliedProbs.length === 1) return [1]
  const implied = impliedProbs.map((p) => (Number.isFinite(p) && p > EPS ? p : 0))
  switch (method) {
    case 'multiplicative':
      return multiplicative(implied)
    case 'additive':
      return additive(implied)
    case 'shin':
      return shin(implied)
    case 'power':
    default:
      return power(implied)
  }
}
