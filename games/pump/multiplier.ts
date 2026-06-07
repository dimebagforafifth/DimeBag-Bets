/**
 * Pump multiplier math — modeled on Stake's published game (CLAUDE.md §7).
 *
 * A round hides `pops` "pop" cells among 25. You pump one cell at a time; each
 * safe pump raises the multiplier, and you bank it before you hit a pop. With no
 * pops revealed yet, surviving `j` pumps has probability C(25−pops, j) / C(25, j),
 * so the fair total-return multiplier is its inverse, shaded by the house edge:
 *
 *   mult(j) = (1 − edge) × C(25, j) / C(25 − pops, j)
 *           = (1 − edge) × Π_{i=0}^{j-1} (25 − i) / (25 − pops − i)
 *
 * which is exactly the Mines formula (Pump is a one-track Mines). The four
 * difficulties only change how many of the 25 cells pop:
 *
 *   Easy     1 pop   → 24 pumps max,  top 24.50×
 *   Medium   3 pops  → 22 pumps max
 *   Hard     5 pops  → 20 pumps max
 *   Expert  10 pops  → 15 pumps max,  top 0.98 × C(25,15) = 3,203,384.80×
 *
 * Stake's baseline is a 2% edge (98% RTP): the Expert top and the per-pump
 * success odds (Easy 96%/92%, Expert 60%/35%) match the live game exactly.
 *
 * The vig is NOT hardcoded — it lives in `PumpHouseConfig` so a manager can set
 * the edge and rounding from one place later, exactly like Mines.
 */

export const CELLS = 25

/** Stake's Pump baseline: 2% edge (98% RTP). */
export const HOUSE_EDGE = 0.02

export type PumpDifficulty = 'easy' | 'medium' | 'hard' | 'expert'

export interface PumpLevelConfig {
  key: PumpDifficulty
  label: string
  /** Pop cells hidden among the 25. */
  pops: number
}

export const DIFFICULTIES: Record<PumpDifficulty, PumpLevelConfig> = {
  easy: { key: 'easy', label: 'Easy', pops: 1 },
  medium: { key: 'medium', label: 'Medium', pops: 3 },
  hard: { key: 'hard', label: 'Hard', pops: 5 },
  expert: { key: 'expert', label: 'Expert', pops: 10 },
}

export const DIFFICULTY_ORDER: PumpDifficulty[] = ['easy', 'medium', 'hard', 'expert']

/** Most pumps possible at a difficulty: reveal every safe cell (25 − pops). */
export function maxPumps(difficulty: PumpDifficulty): number {
  return CELLS - DIFFICULTIES[difficulty].pops
}

/**
 * How the payout multiplier is rounded:
 *  - 'round2' — round half-up to 2 decimals. Matches Stake's published tables
 *    (e.g. Hard pump 2 = 1.23×); the default.
 *  - 'floor2' — floor to 2 decimals (slightly house-favorable).
 *  - 'exact'  — full precision.
 */
export type PayoutRounding = 'round2' | 'floor2' | 'exact'

/** Manager-controlled house settings for Pump. */
export interface PumpHouseConfig {
  /** Fraction the house keeps, e.g. 0.02 = 2% vig. */
  houseEdge: number
  rounding: PayoutRounding
}

/** The shipping default: 2% edge, rounded — matches the live Stake game. */
export const DEFAULT_HOUSE_CONFIG: PumpHouseConfig = {
  houseEdge: HOUSE_EDGE,
  rounding: 'round2',
}

function assertPumps(difficulty: PumpDifficulty, pumps: number): void {
  const max = maxPumps(difficulty)
  if (!Number.isInteger(pumps) || pumps < 0 || pumps > max) {
    throw new Error(`pumps must be an integer in 0..${max} for ${difficulty}, got ${pumps}`)
  }
}

/**
 * Raw, full-precision total-return multiplier after `pumps` safe pumps.
 * `pumps === 0` is `1 − edge`; a full run returns `(1 − edge) × C(25, pops)`.
 * Built as a running product (not factorials) to stay exact in double precision.
 */
export function rawMultiplier(
  difficulty: PumpDifficulty,
  pumps: number,
  houseEdge: number = HOUSE_EDGE,
): number {
  assertPumps(difficulty, pumps)
  const { pops } = DIFFICULTIES[difficulty]
  let m = 1
  for (let i = 0; i < pumps; i++) m *= (CELLS - i) / (CELLS - pops - i)
  return (1 - houseEdge) * m
}

/** Round half-up to 2 decimals, nudged so binary float error can't drop a
 *  true `.005` boundary (this is what lines our table up with Stake's). */
export function round2(value: number): number {
  return Math.round(value * 100 + 1e-9) / 100
}

/** Floor to 2 decimals. */
export function floor2(value: number): number {
  return Math.floor(value * 100) / 100
}

/** Apply the configured rounding policy to a raw multiplier. */
export function applyRounding(rawMult: number, rounding: PayoutRounding): number {
  if (rounding === 'round2') return round2(rawMult)
  if (rounding === 'floor2') return floor2(rawMult)
  return rawMult
}

/**
 * Player-facing / paid-out multiplier after `pumps` safe pumps, under the given
 * house config. The single source of truth for both display and payout.
 */
export function pumpMultiplier(
  difficulty: PumpDifficulty,
  pumps: number,
  config: PumpHouseConfig = DEFAULT_HOUSE_CONFIG,
): number {
  return applyRounding(rawMultiplier(difficulty, pumps, config.houseEdge), config.rounding)
}

/**
 * Probability the NEXT pump survives, given `pumps` already banked: with no pops
 * revealed, that's (safe cells left) / (cells left) = (25 − pops − pumps)/(25 − pumps).
 * Returns 0 once every safe cell is gone.
 */
export function nextSurviveChance(difficulty: PumpDifficulty, pumps: number): number {
  const { pops } = DIFFICULTIES[difficulty]
  const left = CELLS - pumps
  if (left <= 0) return 0
  return Math.max(0, (CELLS - pops - pumps) / left)
}
