/**
 * Mines multiplier math — modeled on Stake / Roobet (CLAUDE.md §7).
 *
 * The total-return multiplier after revealing `d` gems with `m` mines on a
 * 25-tile board, with a configurable house edge (1% by default = 99% RTP, the
 * Stake baseline):
 *
 *   mult(d) = (1 − edge) × C(n, d) / C(n−m, d)
 *           = (1 − edge) × Π_{i=0}^{d-1} (n − i) / (n − m − i)
 *
 * The product form is used here: it stays exact in double precision for every
 * reachable value (the largest, a full clear at 12–13 mines, is C(25,12) =
 * 5,200,300 — well under 2^53) and never builds a huge factorial.
 *
 * The vig is NOT hardcoded into the payout — it lives in `MinesHouseConfig` so a
 * manager/admin can set it (and the rounding policy) later from one place,
 * without touching game logic. See `DEFAULT_HOUSE_CONFIG`.
 */

export const TOTAL_TILES = 25

/** The Stake-baseline 1% edge — the default value behind `DEFAULT_HOUSE_CONFIG`. */
export const HOUSE_EDGE = 0.01

/**
 * How the payout multiplier is rounded:
 *  - 'floor2' — floor to 2 decimals. Slightly house-favorable (we never pay
 *    above the figure on screen); the current default.
 *  - 'exact'  — full precision. Realized edge is exactly `houseEdge` at every
 *    cash-out, matching Stake's settlement behavior.
 */
export type PayoutRounding = 'floor2' | 'exact'

/** Manager-controlled house settings for Mines. */
export interface MinesHouseConfig {
  /** Fraction the house keeps, e.g. 0.01 = 1% vig. */
  houseEdge: number
  /** Rounding policy applied to the payout multiplier. */
  rounding: PayoutRounding
}

/** The shipping default: 1% edge, floored (slightly house-favorable). */
export const DEFAULT_HOUSE_CONFIG: MinesHouseConfig = {
  houseEdge: HOUSE_EDGE,
  rounding: 'floor2',
}

/** How many safe tiles (gems) a board has for a given mine count. */
export function safeTiles(mineCount: number, totalTiles = TOTAL_TILES): number {
  return totalTiles - mineCount
}

function assertValidConfig(mineCount: number, revealed: number, totalTiles: number): void {
  if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > totalTiles - 1) {
    throw new Error(`mineCount must be an integer in 1..${totalTiles - 1}, got ${mineCount}`)
  }
  if (!Number.isInteger(revealed) || revealed < 0 || revealed > safeTiles(mineCount, totalTiles)) {
    throw new Error(
      `revealed must be an integer in 0..${safeTiles(mineCount, totalTiles)}, got ${revealed}`,
    )
  }
}

/**
 * The raw, full-precision total-return multiplier after `revealed` gems.
 * At `revealed === 0` this is `1 − houseEdge`; a full clear returns
 * `(1 − houseEdge) × C(25, mineCount)`.
 */
export function rawMultiplier(
  mineCount: number,
  revealed: number,
  houseEdge: number = HOUSE_EDGE,
  totalTiles = TOTAL_TILES,
): number {
  assertValidConfig(mineCount, revealed, totalTiles)
  let m = 1
  for (let i = 0; i < revealed; i++) {
    m *= (totalTiles - i) / (totalTiles - mineCount - i)
  }
  return (1 - houseEdge) * m
}

/** Floor a multiplier to 2 decimals — the value shown on the board (cosmetic). */
export function displayMultiplier(multiplier: number): number {
  return Math.floor(multiplier * 100) / 100
}

/** Apply the configured rounding policy to a raw multiplier. */
export function applyRounding(rawMult: number, rounding: PayoutRounding): number {
  return rounding === 'floor2' ? displayMultiplier(rawMult) : rawMult
}

/**
 * The player-facing / paid-out multiplier after `revealed` gems, under the given
 * house config. This is the single source of truth for both display and payout.
 */
export function minesMultiplier(
  mineCount: number,
  revealed: number,
  config: MinesHouseConfig = DEFAULT_HOUSE_CONFIG,
  totalTiles = TOTAL_TILES,
): number {
  return applyRounding(
    rawMultiplier(mineCount, revealed, config.houseEdge, totalTiles),
    config.rounding,
  )
}
