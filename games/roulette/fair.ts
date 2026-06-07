/**
 * Roulette provably-fair spin (CLAUDE.md §6, §7). One float off the shared HMAC
 * stream picks the winning pocket uniformly over 0..36:
 *   pocket = floor(float × 37).
 * Deterministic in the seeds, so the result is verifiable after the spin.
 */

import { firstFloat, hashServerSeed } from '../../core/fair.js'
import { POCKETS } from './table.js'

export { hashServerSeed }

/** The winning pocket (0..36) for a spin. */
export function spinPocket(serverSeed: string, clientSeed: string, nonce: number): number {
  return Math.min(POCKETS - 1, Math.floor(firstFloat(serverSeed, clientSeed, nonce) * POCKETS))
}

/** Re-derive the winning pocket from revealed seeds to verify a finished spin. */
export function verifySpin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  expected: number,
): boolean {
  return spinPocket(serverSeed, clientSeed, nonce) === expected
}
