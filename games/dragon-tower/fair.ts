/**
 * Provably-fair skull placement for Dragon Tower (CLAUDE.md §6, §7). The shared
 * HMAC float stream (core/fair) is turned into a per-row skull layout by a
 * Fisher-Yates pick-and-remove — the same primitive Mines and Keno use.
 *
 * Each of the 9 rows is laid out independently: `badTiles(difficulty)` skull
 * positions are drawn from that row's `tiles` slots. Because the server seed is
 * committed (hashed) before the round, the player can recompute every row
 * afterward and confirm nothing moved. Server-authoritative: the whole tower is
 * fixed at creation, never influenced by which tiles the player climbs.
 */

import { floatStream } from '../../core/fair.js'
import { DIFFICULTIES, ROWS, badTiles, type TowerDifficulty } from './difficulty.js'

export { hashServerSeed } from '../../core/fair.js'

/**
 * Derive the skull positions for every row. Returns `ROWS` arrays (bottom row
 * first), each a sorted list of skull tile-indices (0..tiles-1) for that row.
 * Deterministic in (serverSeed, clientSeed, nonce, difficulty).
 */
export function deriveTower(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  difficulty: TowerDifficulty,
): number[][] {
  const { tiles } = DIFFICULTIES[difficulty]
  const skullsPerRow = badTiles(difficulty)
  const floats = floatStream(serverSeed, clientSeed, nonce)
  const layout: number[][] = []
  for (let r = 0; r < ROWS; r++) {
    const pool = Array.from({ length: tiles }, (_, i) => i)
    const skulls: number[] = []
    for (let k = 0; k < skullsPerRow; k++) {
      const index = Math.floor(floats.next().value * pool.length)
      skulls.push(pool.splice(index, 1)[0])
    }
    layout.push(skulls.sort((a, b) => a - b))
  }
  return layout
}

/** True iff the tile is a skull on that row of the given layout. */
export function isSkull(layout: number[][], row: number, tile: number): boolean {
  return layout[row]?.includes(tile) ?? false
}

/**
 * Re-derive the tower from revealed seeds to verify a finished round. `expected`
 * is the layout the player saw; returns whether every row matches.
 */
export function verifyTower(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  difficulty: TowerDifficulty,
  expected: number[][],
): boolean {
  const derived = deriveTower(serverSeed, clientSeed, nonce, difficulty)
  if (derived.length !== expected.length) return false
  return derived.every((row, r) => {
    const want = [...(expected[r] ?? [])].sort((a, b) => a - b)
    return row.length === want.length && row.every((t, i) => t === want[i])
  })
}
