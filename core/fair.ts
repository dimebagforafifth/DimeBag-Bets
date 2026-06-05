/**
 * Provably-fair RNG primitives (CLAUDE.md §6) — shared infrastructure, NOT part
 * of the money model. Every game derives its outcome from these, so the crypto
 * lives in one place and is never copied into a game (§5).
 *
 * Stake's scheme: a per-bet server seed (secret until rotated), a player-set
 * client seed, and a nonce drive HMAC-SHA256. A cursor lets one bet consume more
 * than 32 bytes without changing the algorithm.
 *
 * Isomorphic via @noble/hashes: identical bytes in the browser, Node, and Deno
 * (Supabase edge), so the same derivation runs client-side now and
 * server-authoritatively later — no rewrite.
 */

import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'

/**
 * One 32-byte HMAC-SHA256 block:
 *   HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`).
 */
export function hmacBlock(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor = 0,
): Uint8Array {
  return hmac(sha256, utf8ToBytes(serverSeed), utf8ToBytes(`${clientSeed}:${nonce}:${cursor}`))
}

/**
 * Lazy stream of floats in [0,1), per Stake: each block is consumed 4 bytes at a
 * time as float = Σ byte[i] / 256^(i+1); the cursor advances per block. Used by
 * games that need a sequence of draws (e.g. Mines' shuffle).
 */
export function* floatStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Generator<number, never, unknown> {
  let cursor = 0
  for (;;) {
    const block = hmacBlock(serverSeed, clientSeed, nonce, cursor)
    for (let i = 0; i < block.length; i += 4) {
      let float = 0
      for (let j = 0; j < 4; j++) {
        float += block[i + j] / 256 ** (j + 1)
      }
      yield float
    }
    cursor += 1
  }
}

/**
 * The first 32 bits of the first block as an unsigned integer (0 .. 2^32−1) —
 * the single draw Stake's Crash uses to pick a crash point.
 */
export function firstUint32(serverSeed: string, clientSeed: string, nonce: number): number {
  const b = hmacBlock(serverSeed, clientSeed, nonce, 0)
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0
}

/** SHA-256 hex commitment of a server seed — shown before the round. */
export function hashServerSeed(serverSeed: string): string {
  return bytesToHex(sha256(utf8ToBytes(serverSeed)))
}
