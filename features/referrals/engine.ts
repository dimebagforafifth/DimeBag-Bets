/**
 * Referral engine — PURE logic (no stores, no money), so the anti-abuse rules and the
 * qualification gate are unit-testable in isolation. The store composes these with persistence
 * and the audited core grant.
 */

import type { Referral, ReferralConfig, ReferralResult } from './types.js'

/** A short, human-typable code. Deterministic from the sequence (no randomness) so it's stable
 *  and collision-free; upper-case base-36 keeps it unambiguous on a shared screen. */
export function generateCode(seq: number): string {
  return `INV-${(seq + 1).toString(36).toUpperCase().padStart(4, '0')}`
}

/**
 * Can `refereeId` claim `referral`? The per-invite anti-abuse gate (the store adds the global
 * "a referee may only be referred once"):
 *   - the invite must be unclaimed + still pending, and
 *   - the referee must be DISTINCT from the referrer (no self-referral farming).
 */
export function claimGuard(referral: Referral, refereeId: string): ReferralResult {
  if (referral.status !== 'pending') return { ok: false, reason: 'This invite is no longer open.' }
  if (referral.refereeId != null) return { ok: false, reason: 'This invite was already claimed.' }
  if (!refereeId) return { ok: false, reason: 'A referee is required.' }
  if (refereeId === referral.referrerId) {
    return { ok: false, reason: 'You can’t refer yourself.' }
  }
  return { ok: true }
}

/**
 * Does the referee's REAL settled activity meet the program's qualifying rule? Signup alone
 * (zero settled wagers) never qualifies — the gate that stops self-referral / signup farming.
 */
export function qualifies(settledWagerCount: number, config: ReferralConfig): boolean {
  if (!config.enabled) return false
  return settledWagerCount >= Math.max(1, config.minSettledWagers)
}

/** The per-party reward for a referral (the snapshot taken at creation). */
export function rewardOf(referral: Referral): number {
  return referral.rewardCents > 0 ? referral.rewardCents : 0
}
