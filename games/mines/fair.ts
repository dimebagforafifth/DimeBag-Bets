/**
 * Provably-fair mine placement for Mines — Stake's published algorithm
 * (CLAUDE.md §6, §7). The shared HMAC float stream (core/fair) is turned into a
 * mine layout by a Fisher-Yates pick-and-remove. Because the server seed is
 * committed as a SHA-256 hash *before* the round, the player can recompute the
 * exact layout afterward and confirm nothing was changed.
 *
 * Server-authoritative: the layout is fixed at game creation, never influenced
 * by which tiles the player clicks.
 */

import { floatStream } from '../../core/fair.js'
export { hashServerSeed } from '../../core/fair.js'

/**
 * Derive the mine positions (tile indices 0..totalTiles-1) for a round.
 * Deterministic in (serverSeed, clientSeed, nonce, mineCount): the heart of
 * provable fairness. Returned sorted ascending.
 */
export function deriveMines(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  mineCount: number,
  totalTiles = 25,
): number[] {
  if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > totalTiles - 1) {
    throw new Error(`mineCount must be an integer in 1..${totalTiles - 1}, got ${mineCount}`)
  }
  const pool = Array.from({ length: totalTiles }, (_, i) => i)
  const mines: number[] = []
  const floats = floatStream(serverSeed, clientSeed, nonce)
  for (let k = 0; k < mineCount; k++) {
    const float = floats.next().value
    const index = Math.floor(float * pool.length)
    mines.push(pool.splice(index, 1)[0])
  }
  return mines.sort((a, b) => a - b)
}

/**
 * Re-derive a layout from revealed seeds to verify a finished round.
 * `expected` is the layout the player saw; returns whether it matches.
 */
export function verifyMines(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  mineCount: number,
  expected: number[],
  totalTiles = 25,
): boolean {
  const derived = deriveMines(serverSeed, clientSeed, nonce, mineCount, totalTiles)
  return (
    derived.length === expected.length &&
    derived.every((tile, i) => tile === [...expected].sort((a, b) => a - b)[i])
  )
}
