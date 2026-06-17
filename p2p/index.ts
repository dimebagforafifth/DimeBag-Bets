/**
 * Peer-to-peer challenges — public surface. Two players stake credits head-to-head at agreed
 * odds; the winner takes the pot; the HOUSE TAKES NOTHING (no vig, no margin). All money moves
 * through the shared `core` (escrow = place both, settle = resolve to the winner) — there is no
 * separate ledger and no module-owned balance. Credits/balance only.
 *
 * ── PLAYER-SECTION WIRING (// SEAM) ───────────────────────────────────────────
 * This module does NOT edit the app shell or the player-section registry (per the lane rules).
 * It exports `challengesSection`, a self-describing descriptor (the round-2 social pattern).
 * Agent D is making app/player-sections.ts prop-aware; the WIRING PASS registers this descriptor
 * (and C's Competitions) through D's new registry and extends auth `allowedSections` with
 * `'challenges'`. Until then the section is fully built + tested but not yet shown in nav.
 *
 * ── FRIEND-LIST SEAM ──────────────────────────────────────────────────────────
 * The propose form's "challenge a friend" picker uses this module's own seed roster (ids mirror
 * social/ so they line up). The wiring pass can swap it for the live social graph by feeding
 * `followingOf(viewerId)` (social/) as the friend source — left as a // SEAM in ChallengesSection.
 */

import { ChallengesSection } from './ChallengesSection.js'
import type { PlayerSectionDescriptor } from './types.js'

export { ChallengesSection } from './ChallengesSection.js'

export type {
  Challenge,
  ChallengeStatus,
  ChallengeWinner,
  ChallengeAudience,
  Challenger,
  PlayerSectionProps,
  PlayerSectionDescriptor,
} from './types.js'

// The no-vig odds math (pure).
export {
  EVEN_ODDS,
  MIN_STAKE_CENTS,
  accepterStakeFor,
  potCents,
  winnerMultiplier,
  accepterDecimalOdds,
  winnerStakeCents,
} from './odds.js'

// The money path (→ core place/resolve).
export { escrowStakes, settleStakes, voidStakes, type Escrow } from './escrow.js'

// Lifecycle store.
export {
  createChallengeStore,
  createAccountBook,
  type ChallengeStore,
  type AccountBook,
  type ProposeInput,
} from './challenge-store.js'

// App singletons + demo seed.
export { accountBook, challenges, registerAccount } from './store.js'
export {
  seedChallenges,
  ensureSeeded,
  ensureViewerOffers,
  __resetChallenges,
  SEED_PLAYERS,
} from './seed.js'

/**
 * The Challenges section, self-described for the shell/wiring to mount (player-facing). See the
 * // SEAM above — the wiring pass registers this through D's prop-aware player-section registry.
 */
export const challengesSection: PlayerSectionDescriptor = {
  id: 'challenges',
  label: 'Challenges',
  roles: ['player', 'manager'],
  Component: ChallengesSection,
}
