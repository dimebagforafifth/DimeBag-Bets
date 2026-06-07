/**
 * Normal-distribution helpers (CLAUDE.md §4) — the math behind line pricing.
 *
 * Player props, totals, and spreads all come down to "will a quantity land over
 * or under a line?" We model that quantity (player points, combined score, home
 * margin) as roughly Gaussian and read the over/under probability off the normal
 * survival function. Pure functions; `normalCdf` uses the Abramowitz & Stegun
 * 7.1.26 erf approximation (accurate to ~1e-7), plenty for pricing.
 */

/** Error function, A&S 7.1.26 (|error| < 1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

/** P(X ≤ x) for X ~ Normal(mean, sd). */
export function normalCdf(x: number, mean = 0, sd = 1): number {
  if (!(sd > 0)) throw new Error(`sd must be > 0, got ${sd}`)
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)))
}

/** Survival function P(X > x) = 1 − cdf. */
export function normalSf(x: number, mean = 0, sd = 1): number {
  return 1 - normalCdf(x, mean, sd)
}
