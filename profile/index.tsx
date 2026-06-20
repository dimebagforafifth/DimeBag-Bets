/**
 * Profile v2 + discovery + head-to-head — module public surface (round 3, Lane B / Feature 5).
 *
 * Everything here is a READ-ONLY projection over the audited ledger + verified records (the
 * cardinal rule): it reconciles to the ledger, is rebuildable from it, and NEVER writes a credit.
 * The only writes in this module are follows (a social edge, not money) and a player's own
 * privacy/scope preferences. Build ON records/ + social/ + vip/ — extend, never fork.
 *
 * // SEAM (wiring): the "Players" section self-registers below (idempotent by key), like records/.
 * The wiring pass (1) adds `import '../profile/index.js'` to app/register-player-sections.tsx and
 * (2) adds the `'players'` key to auth/roles.ts (Section union + ALL_SECTIONS + PLAYER_SECTIONS)
 * so players can reach it. // SEAM (Lane A): setProfileProjectionSource → player_profile_stats_mv;
 * setFollowGraphSource → Lane A's graph; setPrivacySource → profile_privacy. // SEAM (Lane D):
 * setCommunitySettingsSource → the operator's Community Settings.
 */

import { registerPlayerSection, type PlayerSectionManifest } from '../app/player-sections.js'
import { ProfilesHub } from './ui/ProfilesHub.js'

export * from './projection.js'
// Lane A — the authoritative materialised mv read API (getProfileStats / getAllProjections /
// rebuild / reconcile / __setProjectionSeed …): the SEAM Lanes C/D + leaderboards read through.
export * from './projection-store.js'
export * from './discovery.js'
export * from './head-to-head.js'
export * from './privacy.js'
export * from './follow-graph.js'
export * from './community-settings.js'
export { subscribeProfiles, profilesVersion } from './store.js'
export { recordsBackedSource } from './projection-adapter.js'
// Lane A — the reference read-only profile card (the richer hub is B's ProfilesHub).
export { ProfileStatsCard } from './ProfileStatsCard.js'
export { ProfilesHub } from './ui/ProfilesHub.js'
export { ProfileView } from './ui/ProfileView.js'
export { Discover } from './ui/Discover.js'
export { HeadToHead as HeadToHeadView } from './ui/HeadToHead.js'

/** The Players player-facing section: Profile v2 + Discover + Head-to-Head behind tabs. */
export const playersSectionManifest: PlayerSectionManifest = {
  key: 'players',
  label: 'Players',
  roles: ['player', 'agent', 'subagent', 'manager'],
  render: (ctx) => <ProfilesHub viewerId={ctx.viewerId} />,
}

// Self-register (idempotent by key) so the wiring pass only adds the import + the auth key.
registerPlayerSection(playersSectionManifest)
