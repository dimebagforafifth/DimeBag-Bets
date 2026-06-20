/**
 * Referral / invite loops (Expert addition #7) — types.
 *
 * A player refers another with an invite CODE. The referee claims it (signup), then on a
 * QUALIFYING settled-wager event BOTH parties get a credit reward GRANTED THROUGH CORE
 * (the grant path, audited) — no new money path. Off-by-default: with no program enabled
 * nothing is issued and placement/figures are byte-identical to today.
 */

export type ReferralStatus = 'pending' | 'qualified' | 'rewarded'

/** One invite. Created by the referrer; `refereeId` fills in on claim; rewards on qualify. */
export interface Referral {
  /** The shareable invite code (also the row id). */
  code: string
  referrerId: string
  /** Null until a referee claims the code. */
  refereeId: string | null
  status: ReferralStatus
  /** The per-party reward, SNAPSHOT from config at creation (so a later config change can't
   *  retroactively alter an issued invite). Integer cents. */
  rewardCents: number
  createdAt: number
  /** When the referee claimed (signup). Qualifying activity is counted from here. */
  claimedAt: number | null
  /** When the referral qualified + rewarded. */
  qualifiedAt: number | null
}

/** The operator's program config (manager-set, persisted). */
export interface ReferralConfig {
  /** OFF by default — no program means no codes, no rewards, a pure no-op. */
  enabled: boolean
  /** The per-party reward, integer cents. */
  rewardCents: number
  /** Qualifying rule: settled wagers the referee must place AFTER claiming (≥ 1; signup alone
   *  never qualifies — the anti-farming gate). */
  minSettledWagers: number
}

export const DEFAULT_REFERRAL_CONFIG: ReferralConfig = {
  enabled: false,
  rewardCents: 0,
  minSettledWagers: 1,
}

/** Result of an attempt to create/claim/qualify — a clean {ok, reason} for the UI. */
export interface ReferralResult {
  ok: boolean
  reason?: string
}
