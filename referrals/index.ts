/**
 * Referrals — invite loops (Expert addition #7).
 *
 * A player invites another; on the referee's first qualifying SETTLED wager BOTH get a credit
 * reward GRANTED THROUGH CORE (the store's audited grant; no new money path). Off-by-default.
 * This barrel exposes the store API, the qualification + arming hooks, the engine predicates,
 * the types, and the player-section descriptor + component.
 */

export { generateCode, claimGuard, qualifies, rewardOf } from './engine.js'

export {
  subscribeReferrals,
  getReferralsVersion,
  setReferralActivityReader,
  getReferralConfig,
  canConfigureReferrals,
  setReferralConfig,
  personalCodeOf,
  createCode,
  claimReferral,
  tryQualify,
  armReferrals,
  referralsFor,
  refereeReferral,
  allReferrals,
  __resetReferrals,
  type ReferralActivityReader,
  type QualifyResult,
} from './store.js'

export {
  DEFAULT_REFERRAL_CONFIG,
  type Referral,
  type ReferralConfig,
  type ReferralStatus,
  type ReferralResult,
} from './types.js'

export { ReferralSection, referralsSection } from './ui/ReferralSection.js'
