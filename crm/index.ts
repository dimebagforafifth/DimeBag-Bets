/**
 * crm/ — native CRM + integrity back-office (the white paper's moat). Read-only
 * over the org, the durable analytics feed, the sportsbook bets, and a synthesized
 * integrity-signals layer. No money path; nothing here mutates a store or balance.
 */

export type {
  PlayerSignals,
  SessionStamp,
  BehaviorFeatures,
  StakeTier,
  ProductLean,
  CrmSegment,
  LifecycleStage,
  SegmentResult,
  RiskScore,
  RiskBand,
  RiskReason,
  MarketWinRate,
  AbuseFlag,
  AbuseKind,
  AbuseCluster,
  ClusterKind,
  CrmProfile,
  CrmPlayerRef,
} from './types.js'

// signals (synthesized integrity telemetry — // SEAM to real session data)
export { synthSignals, hash32 } from './signals.js'

// pure logic (unit-testable; segments re-derive as behaviour changes)
export { deriveBehavior, stakeTierOf, churnRiskOf } from './behavior.js'
export type { BehaviorInput, RecordLike, BetLike } from './behavior.js'
export {
  classifySegment,
  segmentOf,
  lifecycleOf,
  tagsOf,
  SEGMENT_LABEL,
  LIFECYCLE_LABEL,
} from './segments.js'
export { scoreRisk, marketWinRates, bandOf } from './risk.js'
export type { RiskBet, RiskLeg } from './risk.js'
export { detectAbuse, flagsForPlayer } from './abuse.js'
export type { AbuseResult } from './abuse.js'

// demo seed (deterministic, read-only)
export { seedDataset, archetypeOf } from './seed.js'

// live data layer (joins stores → profiles / analytics; falls back to seed)
export {
  buildCrmProfiles,
  buildOperatorAnalytics,
  buildAbuseClusters,
  getCrmDataset,
  subscribeCrm,
  crmVersion,
  LIVE_MIN_RECORDS,
} from './data.js'
export type { CrmDataset, OperatorAnalytics } from './data.js'
