/**
 * Dragon Tower multiplier math — modeled on Stake's published game (CLAUDE.md §7).
 *
 * You climb a 9-level tower. Each level is a row of tiles; some are eggs (safe)
 * and the rest are skulls. Pick an egg and you climb; the total-return multiplier
 * after clearing `level` rows is
 *
 *   mult(level) = (1 − edge) × (tiles / safe) ^ level
 *
 * because each row independently has a `safe / tiles` chance, so reaching level n
 * has probability `(safe / tiles)^n` and a fair payout inverts it. The five
 * difficulties only change the tile/egg split:
 *
 *   Easy    4 tiles, 3 eggs   (1 skull)   → ×4/3 per row, top 13.05×
 *   Medium  3 tiles, 2 eggs   (1 skull)   → ×3/2
 *   Hard    2 tiles, 1 egg    (1 skull)   → ×2
 *   Expert  3 tiles, 1 egg    (2 skulls)  → ×3
 *   Master  4 tiles, 1 egg    (3 skulls)  → ×4,  top 256,901.12×
 *
 * Stake's baseline here is a 2% edge (98% RTP): Master row 1 pays 0.98×4 = 3.92×
 * and the top pays 0.98×4⁹ = 256,901.12×, both matching the live game to the cent.
 *
 * The vig is NOT hardcoded — it lives in `TowerHouseConfig` so a manager can set
 * the edge and rounding from one place later, exactly like Mines.
 */

export const ROWS = 9

/** Stake's Dragon Tower baseline: 2% edge (98% RTP). */
export const HOUSE_EDGE = 0.02

export type TowerDifficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master'

export interface TowerLevelConfig {
  key: TowerDifficulty
  label: string
  /** Tiles in each row. */
  tiles: number
  /** Eggs (safe tiles) in each row; the remaining `tiles − safe` are skulls. */
  safe: number
}

/** The five difficulties, in ascending risk. Insertion order is display order. */
export const DIFFICULTIES: Record<TowerDifficulty, TowerLevelConfig> = {
  easy: { key: 'easy', label: 'Easy', tiles: 4, safe: 3 },
  medium: { key: 'medium', label: 'Medium', tiles: 3, safe: 2 },
  hard: { key: 'hard', label: 'Hard', tiles: 2, safe: 1 },
  expert: { key: 'expert', label: 'Expert', tiles: 3, safe: 1 },
  master: { key: 'master', label: 'Master', tiles: 4, safe: 1 },
}

export const DIFFICULTY_ORDER: TowerDifficulty[] = [
  'easy',
  'medium',
  'hard',
  'expert',
  'master',
]

/**
 * How the payout multiplier is rounded:
 *  - 'round2' — round half-up to 2 decimals. Matches Stake's published tables
 *    (e.g. Master row 1 = 3.92×); the default.
 *  - 'floor2' — floor to 2 decimals (slightly house-favorable).
 *  - 'exact'  — full precision.
 */
export type PayoutRounding = 'round2' | 'floor2' | 'exact'

/** Manager-controlled house settings for Dragon Tower. */
export interface TowerHouseConfig {
  /** Fraction the house keeps, e.g. 0.02 = 2% vig. */
  houseEdge: number
  rounding: PayoutRounding
}

/** The shipping default: 2% edge, rounded — matches the live Stake game. */
export const DEFAULT_HOUSE_CONFIG: TowerHouseConfig = {
  houseEdge: HOUSE_EDGE,
  rounding: 'round2',
}

/** How many skulls sit in each row at a given difficulty. */
export function badTiles(difficulty: TowerDifficulty): number {
  const { tiles, safe } = DIFFICULTIES[difficulty]
  return tiles - safe
}

/** Chance a single random pick clears one row (safe / tiles). */
export function rowWinChance(difficulty: TowerDifficulty): number {
  const { tiles, safe } = DIFFICULTIES[difficulty]
  return safe / tiles
}

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 0 || level > ROWS) {
    throw new Error(`level must be an integer in 0..${ROWS}, got ${level}`)
  }
}

/**
 * Raw, full-precision total-return multiplier after clearing `level` rows.
 * `level === 0` is `1 − edge`; a full climb returns `(1 − edge) × (tiles/safe)^ROWS`.
 * Built as a running product (not Math.pow) to stay exact for the integer ratios.
 */
export function rawMultiplier(
  difficulty: TowerDifficulty,
  level: number,
  houseEdge: number = HOUSE_EDGE,
): number {
  assertLevel(level)
  const { tiles, safe } = DIFFICULTIES[difficulty]
  let m = 1
  for (let i = 0; i < level; i++) m *= tiles / safe
  return (1 - houseEdge) * m
}

/**
 * Round half-up to 2 decimals, nudged by a tiny epsilon so binary float error
 * (e.g. 0.98×1.25 landing at 1.22499999…) doesn't drop a true `.005` boundary —
 * this is what makes our table line up with Stake's to the cent.
 */
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
 * Player-facing / paid-out multiplier after clearing `level` rows, under the
 * given house config. The single source of truth for both display and payout.
 */
export function towerMultiplier(
  difficulty: TowerDifficulty,
  level: number,
  config: TowerHouseConfig = DEFAULT_HOUSE_CONFIG,
): number {
  return applyRounding(rawMultiplier(difficulty, level, config.houseEdge), config.rounding)
}
