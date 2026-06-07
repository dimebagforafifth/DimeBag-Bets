/**
 * Wheel provably-fair spin (CLAUDE.md §7). One float off the shared stream picks
 * the landing segment uniformly: segment = floor(float × segments). Deterministic
 * in the seeds — the result is verifiable after the spin.
 */

import { firstFloat, hashServerSeed } from '../../core/fair.js'
import { SEGMENT_OPTIONS } from './payouts.js'

export { hashServerSeed }

/** The segment the wheel lands on (0 .. segments−1). */
export function spinSegment(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  segments: number,
): number {
  if (!SEGMENT_OPTIONS.includes(segments as (typeof SEGMENT_OPTIONS)[number])) {
    throw new Error(`segments must be one of ${SEGMENT_OPTIONS.join(', ')}, got ${segments}`)
  }
  return Math.min(segments - 1, Math.floor(firstFloat(serverSeed, clientSeed, nonce) * segments))
}

/** Re-derive the landing segment from revealed seeds to verify a spin. */
export function verifySpin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  segments: number,
  expected: number,
): boolean {
  return spinSegment(serverSeed, clientSeed, nonce, segments) === expected
}
