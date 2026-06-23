/**
 * Pick'em — the payout/edge CONFIG (the one place an operator tunes the product).
 *
 * The product: a player picks 2–6 player-prop projections HIGHER or LOWER; hit them all
 * (POWER) or all-but-some (FLEX) to win a FIXED multiplier. The edge is STRUCTURAL — it
 * lives entirely in the gap between the fair multiplier and what we pay, so it survives no
 * matter which props the player picks. PrizePicks-style; the biggest opportunity a
 * straight book leaves on the table.
 *
 * Each higher/lower line is set so the pick is ~a coin flip (PICK_PROBABILITY), so the FAIR
 * all-correct multiple is 2^N. Paying less than that bakes in the house edge:
 *
 *   POWER edges (1 − 0.5^N · M):  2→25%   3→37.5%   4→37.5%   5→37.5%   6→41.4%
 *   FLEX  edges (1 − Σ P(k)·M_k): 3→25%   4→31.25%  5→25%     6→32.8%
 *
 * Honest by default (CLAUDE.md §2.4): `impliedEdge()` exposes the exact edge each row bakes
 * in, so the UI/operator can SHOW it. Money never lives here — staking/paying is all `core`.
 */

export type PickemMode = 'power' | 'flex'

/** Fewest / most projections an entry may combine. */
export const MIN_PICKS = 2
export const MAX_PICKS = 6
/** FLEX needs enough legs for a "miss one" tier to mean anything; below this it's POWER. */
export const FLEX_MIN_PICKS = 3

/**
 * Assumed TRUE hit probability per pick. PrizePicks-style lines are priced so each
 * higher/lower is about a coin flip; this is the basis for the fair multiple (1/p per leg →
 * 2^N for N legs) and the implied-edge readout. Operator-tunable if lines run hotter/colder.
 */
export const PICK_PROBABILITY = 0.5

/**
 * POWER (all-or-nothing) — the TOTAL-RETURN multiple on the stake, by pick count. Hit ALL N.
 * Tune these to move the edge; `derivePowerTable(edge)` regenerates them for a target edge.
 */
export const POWER_TABLE: Readonly<Record<number, number>> = {
  2: 3,
  3: 5,
  4: 10,
  5: 20,
  6: 37.5,
}

/**
 * FLEX (graded) — TOTAL-RETURN multiple by [pickCount][correctCount]. Missing one (or more)
 * still pays a reduced multiple; any correct-count below a row's lowest key pays 0 (lost).
 * Defined for 3–6 picks (FLEX needs ≥ FLEX_MIN_PICKS). Some tiers pay < 1 (a partial
 * consolation that's still a net loss) — that's intentional and house-positive overall.
 */
export const FLEX_TABLE: Readonly<Record<number, Readonly<Record<number, number>>>> = {
  3: { 3: 2.25, 2: 1.25 },
  4: { 4: 5, 3: 1.5 },
  5: { 5: 10, 4: 2, 3: 0.4 },
  6: { 6: 25, 5: 2, 4: 0.4 },
}

/** Whether a mode is offered for a given pick count (FLEX needs ≥ FLEX_MIN_PICKS). */
export function modeAvailable(mode: PickemMode, picks: number): boolean {
  if (picks < MIN_PICKS || picks > MAX_PICKS) return false
  return mode === 'power' ? true : picks >= FLEX_MIN_PICKS
}

/**
 * The TOTAL-RETURN multiple for a settled entry of `picks` legs with `correct` hits.
 *  - POWER: pays POWER_TABLE[picks] only when every leg hit, else 0.
 *  - FLEX:  pays FLEX_TABLE[picks][correct], or 0 below the lowest tier.
 * Returns 0 for an out-of-range count. (Voids are handled upstream by re-grading at the
 * lower effective count — see engine.gradeEntry.)
 */
export function payoutMultiple(mode: PickemMode, picks: number, correct: number): number {
  if (mode === 'power') return correct >= picks ? (POWER_TABLE[picks] ?? 0) : 0
  return FLEX_TABLE[picks]?.[correct] ?? 0
}

/** The multiple quoted for the headline "hit all N" outcome (what the slip advertises). */
export function topMultiple(mode: PickemMode, picks: number): number {
  return payoutMultiple(mode, picks, picks)
}

/* ----------------------------- edge math (pure) ------------------------------ */

/** n choose k (exact, integer). */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  k = Math.min(k, n - k)
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

/** P(exactly k of n picks hit) at per-pick probability p. */
export function binomial(n: number, k: number, p: number = PICK_PROBABILITY): number {
  return choose(n, k) * p ** k * (1 - p) ** (n - k)
}

/** Expected TOTAL return per unit stake = Σ_k P(k correct) × payoutMultiple(k). EV < 1 means
 *  the house is favored. */
export function expectedReturn(
  mode: PickemMode,
  picks: number,
  p: number = PICK_PROBABILITY,
): number {
  let ev = 0
  for (let k = 0; k <= picks; k++) ev += binomial(picks, k, p) * payoutMultiple(mode, picks, k)
  return ev
}

/** The structural house edge (1 − expected return). Positive = house-favored. The honest
 *  readout the UI shows so the player sees exactly what they're up against. */
export function impliedEdge(mode: PickemMode, picks: number, p: number = PICK_PROBABILITY): number {
  return 1 - expectedReturn(mode, picks, p)
}

/**
 * Operator tuning helper: regenerate a POWER table for a TARGET edge. The fair multiple is
 * 1/p^N; paying fair × (1 − edge) bakes in exactly that edge. Rounded to 2dp for a clean
 * published number (so the realized edge is approximately, not exactly, the target).
 */
export function derivePowerTable(
  targetEdge: number,
  p: number = PICK_PROBABILITY,
): Record<number, number> {
  const table: Record<number, number> = {}
  for (let n = MIN_PICKS; n <= MAX_PICKS; n++) {
    const fair = 1 / p ** n
    table[n] = Math.round(fair * (1 - targetEdge) * 100) / 100
  }
  return table
}
