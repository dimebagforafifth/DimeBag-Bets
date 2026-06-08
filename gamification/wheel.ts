/**
 * The daily reward wheel — a weighted random pick. Each segment's probability is its
 * weight ÷ the total weight, so the operator tunes odds purely by editing weights.
 *
 * Randomness comes from the shared provably-fair primitives (core/fair) — the SAME
 * HMAC-SHA256 scheme the games use — so a spin is verifiable and we never fork crypto.
 */

import { firstFloat } from '../core/fair.js'
import type { WheelSegment } from './types.js'

/** Sum of (non-negative) segment weights. */
export function totalWeight(segments: WheelSegment[]): number {
  return segments.reduce((s, seg) => s + Math.max(0, seg.weight), 0)
}

/** Each segment's win probability (0..1) under the current weights. */
export function probabilities(segments: WheelSegment[]): Array<{ id: string; p: number }> {
  const total = totalWeight(segments)
  return segments.map((s) => ({ id: s.id, p: total > 0 ? Math.max(0, s.weight) / total : 0 }))
}

/**
 * Pick the segment a roll in [0,1) lands on, by cumulative weight. Pure + total:
 * roll 0 → the first segment, roll→1 → the last, in proportion to the weights.
 */
export function pickSegment(segments: WheelSegment[], roll: number): WheelSegment {
  const total = totalWeight(segments)
  if (total <= 0 || segments.length === 0) throw new Error('wheel has no weighted segments')
  const point = Math.min(0.999_999_9, Math.max(0, roll)) * total
  let acc = 0
  for (const seg of segments) {
    acc += Math.max(0, seg.weight)
    if (point < acc) return seg
  }
  return segments[segments.length - 1]
}

/** A provably-fair spin: derive the roll from the seed triple, then pick the segment. */
export function spin(
  segments: WheelSegment[],
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): WheelSegment {
  return pickSegment(segments, firstFloat(serverSeed, clientSeed, nonce))
}
