/**
 * analytics/ — operator analytics suite (hold by sport, parlay/SGP penetration,
 * figure trend, cohort retention, credits-per-active-member, net margin). Pure +
 * structural inputs over the durable analytics feed + sportsbook bets. Read-only,
 * integer cents. Complements manager/reporting with the breakdowns it doesn't cover.
 */

export {
  holdBySport,
  parlayMix,
  figureTrend,
  cohortRetention,
  perActiveMember,
  netMarginPct,
} from './metrics.js'

export type {
  AnRecord,
  AnBet,
  SportHold,
  ParlayMix,
  TrendPoint,
  CohortRow,
  SignupRef,
  PerActiveMember,
} from './metrics.js'
