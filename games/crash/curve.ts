/**
 * The rising-multiplier curve for Crash (CLAUDE.md §7).
 *
 * This is presentation only: the multiplier climbs from 1.00× over time on a
 * fixed exponential curve, the same for every round. It is INDEPENDENT of the
 * house edge — the vig lives entirely in where the round crashes (fair.ts), not
 * in how fast the number climbs. Changing the vig never changes this curve.
 *
 * multiplier(t) = e^(GROWTH_PER_SECOND · t), floored to 2 dp, min 1.00.
 */

/** Growth constant — tunes pacing/feel only, not odds. ~2× at 3.5s, ~10× at 11.5s. */
export const GROWTH_PER_SECOND = 0.2

/** The multiplier shown after `elapsedMs` of the round, floored to 2 decimals. */
export function multiplierAt(elapsedMs: number): number {
  const m = Math.exp(GROWTH_PER_SECOND * (Math.max(0, elapsedMs) / 1000))
  return Math.max(1, Math.floor(m * 100) / 100)
}

/** Inverse: the elapsed ms at which the curve first reaches `multiplier`. */
export function elapsedForMultiplier(multiplier: number): number {
  if (multiplier <= 1) return 0
  return (Math.log(multiplier) / GROWTH_PER_SECOND) * 1000
}
