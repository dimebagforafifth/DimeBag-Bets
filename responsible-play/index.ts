/**
 * Responsible-play — player self-limit tooling (Expert addition #1).
 *
 * Public surface: the activity projections (read-only over the durable ledger), the persisted
 * limits store (player-owned set/clear + reads), and the UI (the player "Limits & Activity"
 * section descriptor + component, and the operator read-only console panel). Enforcement lives
 * in core (`assertWithinLimits` in placeWager); this module owns persistence + projection + UI.
 */

export {
  summarizeActivity,
  usageSince,
  EMPTY_ACTIVITY,
  type ActivitySummary,
  type UsageSince,
} from './activity.js'

export {
  subscribeLimits,
  getLimitsVersion,
  setLimit,
  clearLimit,
  limitStateOf,
  effectiveLimitsOf,
  limitedPlayerIds,
  activityOf,
  activitySince,
  activityBreakdown,
  __resetResponsiblePlay,
  __hydrateFromDoc,
  type LimitsDoc,
  type StoredSlot,
} from './store.js'

export { LimitsActivitySection, responsiblePlaySection } from './ui/LimitsActivitySection.js'
