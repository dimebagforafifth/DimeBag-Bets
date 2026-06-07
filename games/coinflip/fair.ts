/**
 * Coin Flip provably-fair draws (CLAUDE.md §6). Each flip is drawn sequentially
 * from the shared float stream (the same primitive HiLo/Keno/Mines use): flip i
 * reads the float at sequence position i and is HEADS if that float < 0.5, else
 * TAILS. A fair coin — 50/50 — so a streak can run indefinitely. Fully
 * determined by (serverSeed, clientSeed, nonce); animations are cosmetic and
 * never change the seed-decided result.
 */

import { floatStream, hashServerSeed } from '../../core/fair.js'

export { hashServerSeed }

/** A single coin face. Same union used for the player's call. */
export type CoinFace = 'heads' | 'tails'

function faceFromFloat(f: number): CoinFace {
  return f < 0.5 ? 'heads' : 'tails'
}

/** The coin at sequence position `index` (0 = the streak's first flip). */
export function coinAt(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  index: number,
): CoinFace {
  const gen = floatStream(serverSeed, clientSeed, nonce)
  let f = 0
  for (let i = 0; i <= index; i++) f = gen.next().value as number
  return faceFromFloat(f)
}

/** The first `count` coins of the streak, in order. */
export function coinsUpTo(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count: number,
): CoinFace[] {
  const gen = floatStream(serverSeed, clientSeed, nonce)
  const out: CoinFace[] = []
  for (let i = 0; i < count; i++) out.push(faceFromFloat(gen.next().value as number))
  return out
}

/**
 * Re-derive a streak from the revealed seeds to verify it: the dealt `results`
 * must match the seed-derived coin sequence, and each recorded `call` must agree
 * with whether that flip landed (a correct call wins, a wrong call busts). This
 * lets a player confirm both the coins AND the streak's outcome independently.
 */
export function verifyCoinFlips(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  calls: CoinFace[],
  results: CoinFace[],
): boolean {
  if (calls.length !== results.length) return false
  const want = coinsUpTo(serverSeed, clientSeed, nonce, results.length)
  return results.every((r, i) => r === want[i] && (calls[i] === r) === (calls[i] === want[i]))
}
