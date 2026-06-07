/**
 * Shared house-edge / RTP policy (CLAUDE.md §2 clean, §4 honest).
 *
 * Managers tune a game's edge as an **RTP %** (the fraction of stake returned on
 * average); the house edge is simply `1 − RTP`. This module is the single source
 * of truth for the allowed range, the neutral default, the warning thresholds and
 * the edge⇄RTP conversions — every other piece (each game's payout math, the edge
 * store, the management panel) imports from here so the policy lives in one place.
 */

/** RTP = fraction of stake returned on average; edge = 1 − RTP. */
export const RTP_POLICY = {
  /** Hard floor: 95% RTP = 5% edge — the most a manager can take. */
  MIN: 0.95,
  /** Ceiling: 100% RTP = 0 edge. No player-favorable (>100%) settings. */
  MAX: 1,
  /** Neutral anchor: 99% RTP = 1% edge. */
  DEFAULT: 0.99,
  /** Below this, surface the disengagement warning. */
  WARN_BELOW: 0.97,
} as const

/** Bounds for the manager control; a game may override via its meta's rtpBounds. */
export const RTP_BOUNDS = { min: RTP_POLICY.MIN, max: RTP_POLICY.MAX } as const

/** House edge (0..1) for a given RTP. */
export function rtpToEdge(rtp: number): number {
  return 1 - rtp
}

/** RTP for a given house edge (0..1). */
export function edgeToRtp(edge: number): number {
  return 1 - edge
}

/** Clamp an RTP into the policy range [MIN, MAX] (falls back to DEFAULT if NaN). */
export function clampRtp(rtp: number): number {
  if (!Number.isFinite(rtp)) return RTP_POLICY.DEFAULT
  return Math.min(RTP_POLICY.MAX, Math.max(RTP_POLICY.MIN, rtp))
}
