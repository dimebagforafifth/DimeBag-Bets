/**
 * Competitions & creators — the time-boxed events / tournament engine.
 *
 * A competition ranks opted-in players by a configurable metric off REAL settled activity
 * (read-only over the book ledger + bets). An optional entry fee HOLDS through `core`; at
 * close the prize pool pays out through `core.grant`. Leaderboards are pure read-only
 * projections. Credits/balance only; integer cents; no separate money path.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * // SEAM (wiring pass): MOUNTING THE "COMPETITIONS" PLAYER SECTION.
 * Lane rules forbid editing the shared shell/registry, and Agent D is making the player-
 * section registry prop-aware this round. So this ships READY-TO-MOUNT as a descriptor; the
 * wiring pass registers it (the round-2 pattern, same as pickem/social):
 *
 *   In app/register-player-sections.ts (or D's prop-aware equivalent):
 *     import { competitionsSectionMeta } from '../events/index.js'
 *     registerPlayerSection({
 *       key: competitionsSectionMeta.key,
 *       label: competitionsSectionMeta.label,
 *       roles: ['player'],
 *       Component: competitionsSectionMeta.Component as ComponentType,
 *     })
 *
 *   In auth/roles.ts: add 'competitions' to Section, ALL_SECTIONS, and PLAYER_SECTIONS.
 *
 *   The component takes { account, playerName, isDemo?, onBalanceChange? } — the same player-
 *   section props pickem/community use. D's prop-aware registry passes these directly; until
 *   then App.tsx mounts it with a render clause mirroring the 'pickem' case.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */

import { CompetitionsSection, type CompetitionsSectionProps } from './ui/CompetitionsSection.js'

export { CompetitionsSection, type CompetitionsSectionProps }

/** Registry-ready descriptor for the Competitions player section (round-2 pattern). */
export const competitionsSectionMeta = {
  key: 'competitions' as const,
  label: 'Competitions',
  /** Player-facing lane (sibling of casino / sportsbook / pickem / community). */
  player: true,
  Component: CompetitionsSection,
}

export type {
  Competition,
  CompetitionStatus,
  CompetitionTheme,
  Settlement,
  MetricType,
  Eligibility,
  Entry,
  Standing,
  Payout,
  SeededStanding,
} from './types.js'

// The store — the money path (entry holds + prize grants through core) + the live list.
export {
  getCompetitions,
  getCompetition,
  getEntries,
  entriesFor,
  entriesForAccount,
  isEntered,
  statusOf,
  createCompetition,
  joinCompetition,
  closeCompetition,
  payCompetition,
  leaderboard,
  projectedPool,
  subscribeCompetitions,
  getCompetitionsVersion,
  __resetCompetitions,
  type CreateCompetitionInput,
  type JoinInput,
} from './store.js'

// Standings + metrics (pure read-only projections).
export { standingsFor, payoutsFor, prizePool, prizeForRank, allocatePrizes } from './leaderboard.js'
export {
  metricValue,
  metricValueFrom,
  totalWagered,
  netProfit,
  biggestMultiplier,
  longestWinStreak,
  wonParlays,
  scorableBetRows,
  formatMetricValue,
  METRIC_META,
  ENTRY_GAME_KEY,
} from './metrics.js'

// Eligibility (read-only over org / VIP) + the demo seed.
export { isEligible, eligiblePlayers, lifetimeWagered, RANK_ORDER } from './eligibility.js'
export { seedDemoCompetitions } from './seed.js'
