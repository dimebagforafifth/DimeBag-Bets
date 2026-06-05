/**
 * Provably-fair RNG for Mines — Stake's published algorithm (CLAUDE.md §6, §7).
 *
 * For each bet a server seed (secret until rotated), a client seed (player-set),
 * and a nonce (per bet) drive HMAC-SHA256. The byte stream is turned into floats
 * in [0,1), and mines are placed by a Fisher-Yates pick-and-remove. Because the
 * server seed is committed as a SHA-256 hash *before* the round, the player can
 * recompute the exact mine layout afterward and confirm nothing was changed.
 *
 * This is server-authoritative: the layout is fixed at game creation, never
 * influenced by which tiles the player clicks.
 */

import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'

// Isomorphic crypto (@noble/hashes): the same code runs in the browser now and
// server-authoritatively later (Node / Supabase edge / Deno) with no rewrite.

/**
 * Lazy stream of floats in [0,1), per Stake:
 *   HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`) -> 32 bytes,
 *   consumed 4 bytes at a time as float = Σ byte[i] / 256^(i+1).
 * The cursor increments once each 32-byte block is exhausted.
 */
function* floatStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Generator<number, never, unknown> {
  const key = utf8ToBytes(serverSeed)
  let cursor = 0
  for (;;) {
    const digest = hmac(sha256, key, utf8ToBytes(`${clientSeed}:${nonce}:${cursor}`))
    for (let i = 0; i < digest.length; i += 4) {
      let float = 0
      for (let j = 0; j < 4; j++) {
        float += digest[i + j] / 256 ** (j + 1)
      }
      yield float
    }
    cursor += 1
  }
}

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

/** SHA-256 hex commitment of a server seed — shown before the round. */
export function hashServerSeed(serverSeed: string): string {
  return bytesToHex(sha256(utf8ToBytes(serverSeed)))
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
