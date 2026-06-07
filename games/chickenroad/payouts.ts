/**
 * Chicken Road payouts (CLAUDE.md §7) — the "cross the road" ladder.
 *
 * The chicken advances lane by lane. Each lane is survived with probability
 * `survival` (one provably-fair coin per lane), so reaching lane i has
 * probability survivalⁱ. The lane multiplier is COMPUTED as (1 − edge) / survivalⁱ,
 * which makes the expected return exactly (1 − edge) at EVERY lane — a provably
 * correct, manager-configurable 2% house edge, matching the real InOut Games
 * "Chicken Road" (98% RTP), rather than a copied table. Harder difficulties
 * survive less often and so climb much faster.
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'daredevil'
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'daredevil']

export interface ChickenHouseConfig {
  /** House edge, e.g. 0.02 = 2%. Manager-configurable. */
  edge: number
}
/** Matches the real InOut Games "Chicken Road": 98% RTP, a 2% house edge. */
export const DEFAULT_CHICKEN_CONFIG: ChickenHouseConfig = { edge: 0.02 }

export interface DifficultySpec {
  /** Probability of surviving a single lane (0..1). */
  survival: number
  /** How many lanes the road has (a safe finish auto-cashes at the last). */
  lanes: number
}

export const SPECS: Record<Difficulty, DifficultySpec> = {
  easy: { survival: 0.9, lanes: 20 },
  medium: { survival: 0.8, lanes: 15 },
  hard: { survival: 0.7, lanes: 12 },
  daredevil: { survival: 0.55, lanes: 10 },
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** The multiplier for reaching lane `i` (1-based) at a difficulty + edge. */
export function laneMultiplier(
  i: number,
  difficulty: Difficulty,
  config: ChickenHouseConfig = DEFAULT_CHICKEN_CONFIG,
): number {
  const { survival, lanes } = SPECS[difficulty]
  if (!Number.isInteger(i) || i < 1 || i > lanes) {
    throw new Error(`lane must be an integer in 1..${lanes}, got ${i}`)
  }
  return round2((1 - config.edge) / survival ** i)
}

/** The full ladder of multipliers for a difficulty: index 0 = lane 1. */
export function laneMultipliers(
  difficulty: Difficulty,
  config: ChickenHouseConfig = DEFAULT_CHICKEN_CONFIG,
): number[] {
  const { lanes } = SPECS[difficulty]
  return Array.from({ length: lanes }, (_, k) => laneMultiplier(k + 1, difficulty, config))
}
