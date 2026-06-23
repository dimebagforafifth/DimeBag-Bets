/**
 * The social core — public surface (CLAUDE.md §1). Friends/follows, the activity feed of
 * shared slips, and tail/fade (which place REAL bets through the book → core). Credits only.
 *
 * ── SECTION WIRING (// SEAM) ──────────────────────────────────────────────────
 * There is no dynamic player-section registry in the app shell yet — sections are hardcoded
 * in app/App.tsx (the NAV array + the render switch) and auth/roles.ts (the `Section` union +
 * PLAYER_SECTIONS). Per the lane rules this module does NOT edit those SHARED files; instead
 * it exports `communitySection`, a self-describing descriptor. The wiring pass mounts it with
 * ~3 lines:
 *   1. auth/roles.ts: add `'community'` to the `Section` union + PLAYER_SECTIONS.
 *   2. app/App.tsx NAV: `{ key: 'community', label: 'Community' }`.
 *   3. app/App.tsx render: when `activeSection === 'community'` and there's a player, mount
 *      <CommunitySection viewerId={player.id} viewerName={player.name} account={account}
 *        onBalanceChange={refresh} /> (same shape as RewardsSection / BookView).
 * (When several modules export descriptors, the wiring pass can fold them into a small
 * registry that the shell maps over — but that registry doesn't exist today.)
 */

import { CommunitySection } from './CommunitySection.js'
import type { PlayerSectionDescriptor } from './types.js'

export { CommunitySection } from './CommunitySection.js'

export type {
  SharedSlip,
  Reaction,
  Comment,
  SlipOrigin,
  PlayerSectionProps,
  PlayerSectionDescriptor,
} from './types.js'
export { REACTION_EMOJIS } from './types.js'

// Social graph
export {
  follow,
  unfollow,
  isFollowing,
  followingOf,
  followersOf,
  followCounts,
  subscribeFollows,
  followsVersion,
  __resetFollows,
} from './follows-store.js'

// Activity feed
export {
  shareSlip,
  getSlip,
  allSlips,
  setVisibility,
  toggleReaction,
  reactionCounts,
  addComment,
  feedFor,
  subscribeFeed,
  feedVersion,
  __resetFeed,
  type ShareSlipInput,
} from './feed-store.js'

// Tail / fade (route through the book → core)
export { tailSlip, fadeSlip, oppositeSide, oppositeLeg, canFade, type TailInput, type FadeInput } from './tail.js'

// Demo seed
export { seedSocial, ensureSeeded, __resetSocial, SEED_PLAYERS } from './seed.js'

/**
 * The Community section, self-described for the shell/wiring to mount (player-facing). See
 * the // SEAM above — the wiring pass registers this with a 3-line shell change.
 */
export const communitySection: PlayerSectionDescriptor = {
  id: 'community',
  label: 'Community',
  roles: ['player', 'manager'],
  Component: CommunitySection,
}
