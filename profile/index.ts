/**
 * Public surface of the player-profile foundation (Round 3, Lane A).
 *
 * // SEAM (Lanes B & D): the read-only projection API + the follow graph + privacy resolution.
 *   - Lane B (discovery / H2H) reads `getProfileStats` / `getAllProjections`.
 *   - Lane D (pool privacy) reads `followingOf` / `isFollower` + `canView`.
 *
 * Everything here is a read-only projection of the audited ledger — it moves no money.
 */

// The projection (player_profile_stats_mv)
export {
  STAT_WINDOWS,
  UNIT_CENTS,
  projectWindow,
  projectPlayer,
  windowRows,
} from './projection.js'
export type { StatWindow, ProfileStatBlock, SportStat } from './projection.js'

export {
  SEASON_MS,
  rebuild,
  reconcile,
  getProfileStats,
  getPlayerProjection,
  getAllProjections,
  getProjectionBuiltAt,
  getProjectionVersion,
  subscribeProjection,
  setSeasonStart,
  getSeasonStart,
  __setProjectionSeed,
  __resetProjection,
} from './projection-store.js'
export type { Reconciliation } from './projection-store.js'

// The follow graph (extends social) — followingOf is the // SEAM for Lane D's pool privacy.
export {
  follow,
  unfollow,
  isFollowing,
  followingOf,
  followersOf,
  followCounts,
  subscribeFollows,
  followsVersion,
  addFollow,
  removeFollow,
  followEdgesOf,
  scopedFollowing,
  isFollower,
  scopedEdges,
  subscribeFollowEdges,
  followEdgesVersion,
  __resetFollowEdges,
} from './follow-graph.js'
export type { FollowScope, FollowEdge } from './follow-graph.js'

// Privacy resolution
export {
  getVisibility,
  setVisibility,
  canView,
  visibilityFor,
  subscribePrivacy,
  privacyVersion,
  __resetPrivacy,
} from './privacy.js'
export type { Visibility, BlockKey } from './privacy.js'

// Reference UI (a finished, token-based read-only card; B composes the richer discovery/H2H UI)
export { ProfileStatsCard } from './ProfileStatsCard.js'
