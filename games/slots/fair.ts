/**
 * Slots provably-fair spin (CLAUDE.md §6, §7). Three reels, each driven by one
 * float off the shared stream: floats[r] maps through the cumulative reel
 * weights to a symbol index. Same strip/weights on every reel. Deterministic in
 * the seeds — the result is verifiable after the spin; the UI animation is
 * purely cosmetic and never changes this outcome.
 */

import { floatStream, hashServerSeed } from '../../core/fair.js'
import { SYMBOLS, TOTAL_WEIGHT } from './payouts.js'

export { hashServerSeed }

export const REELS = 3

/** Cumulative weight boundaries on the [0, TOTAL_WEIGHT) line, one per symbol. */
const CUMULATIVE: number[] = (() => {
  const out: number[] = []
  let acc = 0
  for (const s of SYMBOLS) {
    acc += s.weight
    out.push(acc)
  }
  return out
})()

/** Map a float in [0,1) through the weighted strip to a symbol index. */
function symbolFromFloat(f: number): number {
  const point = f * TOTAL_WEIGHT
  for (let i = 0; i < CUMULATIVE.length; i++) {
    if (point < CUMULATIVE[i]) return i
  }
  return SYMBOLS.length - 1 // float === a hair under 1; clamp to the last symbol
}

/** The three reel symbol indices for a spin: [s0, s1, s2]. */
export function spin(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const gen = floatStream(serverSeed, clientSeed, nonce)
  const out: number[] = []
  for (let r = 0; r < REELS; r++) out.push(symbolFromFloat(gen.next().value as number))
  return out
}

/** Re-derive the reel result from revealed seeds to verify a spin. */
export function verifySpin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expected: readonly number[],
): boolean {
  const got = spin(serverSeed, clientSeed, nonce)
  return got.length === expected.length && got.every((s, i) => s === expected[i])
}
