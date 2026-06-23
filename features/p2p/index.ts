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
 * ── FRIEND-LIST (live social graph) ───────────────────────────────────────────
 * The propose form's "challenge a friend" picker reads the REAL social graph —
 * `followingOf(viewerId)` (social/, read-only) — with names resolved from the org book. The
 * section seeds the demo social graph (social `ensureSeeded`, idempotent) so it's populated.
 *
 * ── OPERATOR SETTLE/VOID ───────────────────────────────────────────────────────
 * Settlement is operator/result-driven (never a participant). Two operator surfaces drive the
 * store's settle/void: an in-section control gated on an operator `role`, and the console
 * "Challenges Desk" tile (`challengesDeskManifests` — see manifest.ts // SEAM for the wiring
 * pass). The economy-mode-aware stake surface consumes `useEconomyMode` / `ModeGate` (Lane A
 * interlock; default lives in economy-mode.tsx with a // SEAM).
 */

import { ChallengesSection } from './ChallengesSection.js'
import type { PlayerSectionDescriptor } from './types.js'

export { ChallengesSection } from './ChallengesSection.js'

// Operator console tile (settle/void) — registered by the wiring pass (see manifest.ts // SEAM).
export { ChallengesDeskPanel } from './ChallengesDeskPanel.js'
export { challengesDeskManifests } from './manifest.js'

// Economy-mode seam (Lane A interlock) — the mode-aware stake surface consumes these.
export { useEconomyMode, ModeGate, __setEconomyMode, type EconomyMode } from './economy-mode.js'

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
