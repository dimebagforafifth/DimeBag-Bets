/**
 * Diamonds provably-fair gem deal (CLAUDE.md §3, §7). Five gems are dealt, each
 * one of 8 colours drawn uniformly & independently off the shared float stream
 * (same primitive as Keno/HiLo/Mines): gem i's colour = floor(floats[i] × 8).
 * Deterministic in the seeds — the deal is fully verifiable after the round.
 */

import { floatStream, hashServerSeed } from '../../core/fair.js'

export { hashServerSeed }

/** Distinct gem colours; each gem's colour index is 0..COLOURS−1. */
export const COLOURS = 8
/** Gems dealt per round. */
export const GEMS = 5

/** Deal the 5 gem colour indices (0..7), in order, off the float stream. */
export function drawGems(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const gen = floatStream(serverSeed, clientSeed, nonce)
  const out: number[] = []
  for (let i = 0; i < GEMS; i++) {
    out.push(Math.min(COLOURS - 1, Math.floor((gen.next().value as number) * COLOURS)))
  }
  return out
}

/** Re-derive the deal from revealed seeds to verify a round. */
export function verifyGems(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  gems: number[],
): boolean {
  const want = drawGems(serverSeed, clientSeed, nonce)
  return gems.length === want.length && gems.every((g, i) => g === want[i])
}
