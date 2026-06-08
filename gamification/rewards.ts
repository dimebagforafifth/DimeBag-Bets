/**
 * The single money seam for gamification. EVERY reward — missions, achievements, the
 * wheel, tournaments — pays out as free-play through `core.grant`, the exact same
 * mechanism VIP free-play uses. We never touch the money plumbing; we call the public
 * interface. The grant credits the player's core figure and emits a GrantEvent, so the
 * operator's reporting/ledger record it just like any other free play.
 */

import { grant, type Account } from '../core/index.js'

export type RewardSource = 'mission' | 'achievement' | 'wheel' | 'tournament'

export interface RewardMeta {
  source: RewardSource
  /** A short detail (mission/achievement id, segment label, tournament id…) for the log. */
  detail?: string
}

/**
 * Pay `cents` of free play into `account` via core.grant. Returns the cents actually
 * granted — 0 for a non-positive/zero reward (so a $0 wheel segment is a clean no-op,
 * never a thrown grant). Callers own idempotency (mark the thing claimed before/after).
 */
export function payFreePlay(account: Account, cents: number, meta: RewardMeta): number {
  if (!Number.isInteger(cents) || cents <= 0) return 0
  grant(account, cents, { kind: 'free-play', module: 'gamification', source: meta.source, detail: meta.detail })
  return cents
}
