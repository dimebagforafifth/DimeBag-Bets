/**
 * Mines multiplier math — modeled on Stake / Roobet (CLAUDE.md §7).
 *
 * The total-return multiplier after revealing `d` gems with `m` mines on a
 * 25-tile board, with a 1% house edge (99% RTP, identical to Stake):
 *
 *   mult(d) = (1 − edge) × C(n, d) / C(n−m, d)
 *           = (1 − edge) × Π_{i=0}^{d-1} (n − i) / (n − m − i)
 *
 * The product form is used here: it stays exact in double precision for every
 * reachable value (the largest, a full clear at 12–13 mines, is C(25,12) =
 * 5,200,300 — well under 2^53) and never builds a huge factorial.
 */

export const TOTAL_TILES = 25
export const HOUSE_EDGE = 0.01

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
 * The raw total-return multiplier after `revealed` gems. At `revealed === 0`
 * this is `1 − edge` (0.99); a full clear returns `0.99 × C(25, mineCount)`.
 */
export function rawMultiplier(
  mineCount: number,
  revealed: number,
  totalTiles = TOTAL_TILES,
): number {
  assertValidConfig(mineCount, revealed, totalTiles)
  let m = 1
  for (let i = 0; i < revealed; i++) {
    m *= (totalTiles - i) / (totalTiles - mineCount - i)
  }
  return (1 - HOUSE_EDGE) * m
}

/**
 * Floor a multiplier to 2 decimals — the value shown to (and paid to) the
 * player. Flooring (not rounding up) keeps the book honest: we never pay above
 * the figure on screen. Matches how Stake displays/settles its multipliers.
 */
export function displayMultiplier(multiplier: number): number {
  return Math.floor(multiplier * 100) / 100
}

/** Convenience: the player-facing multiplier after `revealed` gems. */
export function minesMultiplier(
  mineCount: number,
  revealed: number,
  totalTiles = TOTAL_TILES,
): number {
  return displayMultiplier(rawMultiplier(mineCount, revealed, totalTiles))
}
