/**
 * Provably-fair pop placement for Pump (CLAUDE.md §6, §7). The shared HMAC float
 * stream (core/fair) is turned into a set of pop-cell positions by a Fisher-Yates
 * pick-and-remove — the same primitive Mines uses.
 *
 * The 25 cells are pumped in fixed order (0,1,2,…); the balloon pops the first
 * time a pumped cell is a pop position. Because the server seed is committed
 * (hashed) before the round, the player can recompute the pop set afterward and
 * confirm nothing moved. Server-authoritative: the layout is fixed at creation,
 * never influenced by when the player cashes out.
 */

import { floatStream } from '../../core/fair.js'
import { CELLS, DIFFICULTIES, type PumpDifficulty } from './multiplier.js'

export { hashServerSeed } from '../../core/fair.js'

/**
 * Derive the pop-cell positions (indices 0..24) for a round, sorted ascending.
 * Deterministic in (serverSeed, clientSeed, nonce, difficulty).
 */
export function derivePops(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  difficulty: PumpDifficulty,
): number[] {
  const { pops } = DIFFICULTIES[difficulty]
  const pool = Array.from({ length: CELLS }, (_, i) => i)
  const out: number[] = []
  const floats = floatStream(serverSeed, clientSeed, nonce)
  for (let k = 0; k < pops; k++) {
    const index = Math.floor(floats.next().value * pool.length)
    out.push(pool.splice(index, 1)[0])
  }
  return out.sort((a, b) => a - b)
}

/**
 * Re-derive the pop set from revealed seeds to verify a finished round.
 * `expected` is the set the player saw; returns whether it matches.
 */
export function verifyPops(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  difficulty: PumpDifficulty,
  expected: number[],
): boolean {
  const derived = derivePops(serverSeed, clientSeed, nonce, difficulty)
  const want = [...expected].sort((a, b) => a - b)
  return derived.length === want.length && derived.every((p, i) => p === want[i])
}
