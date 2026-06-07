/**
 * Chicken Road provably-fair road (CLAUDE.md §7). One float off the shared
 * stream decides each lane: the chicken survives lane i iff float < survival.
 * The crash lane is the first lane that fails (or lanes+1 if it survives the
 * whole road). Deterministic in the seeds — verifiable after the round.
 */

import { floatStream, hashServerSeed } from '../../core/fair.js'

export { hashServerSeed }

/** The 1-based lane where the chicken is hit, or lanes+1 if it crosses safely. */
export function crashLane(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  survival: number,
  lanes: number,
): number {
  const gen = floatStream(serverSeed, clientSeed, nonce)
  for (let i = 0; i < lanes; i++) {
    if ((gen.next().value as number) >= survival) return i + 1 // failed this lane
  }
  return lanes + 1 // crossed every lane
}

/** Re-derive the crash lane from revealed seeds to verify a finished round. */
export function verifyCrashLane(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  survival: number,
  lanes: number,
  expected: number,
): boolean {
  return crashLane(serverSeed, clientSeed, nonce, survival, lanes) === expected
}
