/**
 * Verified records + public profiles — module public surface (round 2, Agent B).
 *
 * The switching-cost moat: a permanent, tamper-proof, braggable record of every settled pick,
 * plus a public profile that shows it off. Everything is a READ-ONLY projection of the durable
 * ledger — this module owns no money path and mutates nothing (no core, no ledger, no org).
 *
 * The Profile section self-registers with the player-section registry (app/player-sections);
 * the WIRING PASS mounts the registry into the app shell/nav. See README / report.
 */

import { registerPlayerSection, type PlayerSectionManifest } from '../../app/player-sections.js'
import { ProfileSection } from './ui/ProfileSection.js'

export type {
  VerifiedRecord,
  PeriodStats,
  StreakInfo,
  BetHighlight,
  ClvSummary,
  ClvDatum,
  RecordBadge,
  RecordBadgeTone,
  RecordIntegrity,
  RecordInput,
  BetRow,
} from './types.js'

export {
  buildRecord,
  periodStats,
  withinPeriod,
  streaks,
  highlights,
  fingerprint,
} from './record.js'
export { clvSummary } from './clv.js'
export { deriveBadges } from './badges.js'
export { shareableSummary } from './share.js'
export {
  getRecord,
  listProfilePlayers,
  isDemoProfile,
  subscribeRecords,
  getRecordsVersion,
  __setRecordsSeed,
  __resetRecords,
} from './store.js'
export { seededAccountIds, seededRows, seededClv, hasSeed } from './seed.js'
export { ProfileSection } from './ui/ProfileSection.js'

/** The Profile player-facing section. Registered below; mounted by the wiring pass. */
export const profileSectionManifest: PlayerSectionManifest = {
  key: 'profile',
  label: 'Profile',
  roles: ['player', 'agent', 'subagent', 'manager'],
  Component: ProfileSection,
}

// Register from our own module file (idempotent by key) so the wiring pass only has to render
// the registry — it never edits this module. Importing `records/` wires the Profile section.
registerPlayerSection(profileSectionManifest)
