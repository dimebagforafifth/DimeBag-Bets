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

import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

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

/** The first float in [0,1) — the single draw games like Dice/Limbo need. */
export function firstFloat(serverSeed: string, clientSeed: string, nonce: number): number {
  return floatStream(serverSeed, clientSeed, nonce).next().value
}

/** SHA-256 hex commitment of a server seed — shown before the round. */
export function hashServerSeed(serverSeed: string): string {
  return bytesToHex(sha256(utf8ToBytes(serverSeed)))
}

/**
 * Sample a uniform integer in [0, poolSize) from the float stream without modulo
 * bias (issue #5). The naive `Math.floor(float * n)` skews some indices by ~1/2^32
 * for non-power-of-two pool sizes. Rejection sampling discards floats in the
 * "remainder zone" above `floor(2^32 / poolSize) × poolSize`, where bias would
 * occur. The rejection probability is at most `poolSize / 2^32` per draw — at most
 * one extra draw per ~4M calls — negligible cost, strict uniformity. Apply this
 * anywhere a `Math.floor(float * n)` pick-and-remove needs strict fairness.
 */
export function uniformSample(
  stream: Generator<number, never, unknown>,
  poolSize: number,
): number {
  const threshold = (Math.floor(4294967296 / poolSize) * poolSize) / 4294967296
  for (;;) {
    const f = stream.next().value
    if (f < threshold) return Math.floor(f * poolSize)
  }
}
