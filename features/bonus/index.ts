/**
 * Public surface of the bonus rules engine (CLAUDE.md §4). The console panel + the wiring
 * pass import from here. Money moves only through core (see engine.ts).
 */

export type {
  BonusTrigger,
  RewardKind,
  BonusReward,
  BonusEligibility,
  BonusRule,
  PlayerSegment,
  EligibilityContext,
  RewardContext,
} from './rules.js'
export {
  isEligible,
  playerSegment,
  rawRewardCents,
  rewardGrantCents,
  requiredTurnoverCents,
  SEGMENT_VIP_WAGERED,
  SEGMENT_NEW_WAGERED,
} from './rules.js'

export type { BonusGrant, GrantStatus, TriggerOpts, FireResult } from './engine.js'
export {
  DEFAULT_RULES,
  getBonusRules,
  getBonusRulesVersion,
  subscribeBonusRules,
  upsertBonusRule,
  setBonusRuleEnabled,
  getBonusGrants,
  getBonusGrantsVersion,
  subscribeBonusGrants,
  grantsForPlayer,
  eligibilityContext,
  fireTrigger,
  grantRuleTo,
  recordTurnover,
  expireDue,
  armBonusEngine,
  seedBonusDemo,
  __resetBonusEngine,
} from './engine.js'
