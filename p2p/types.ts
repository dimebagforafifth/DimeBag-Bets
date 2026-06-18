/**
 * Peer-to-peer challenges — the shared types (the uncopyable social mechanic). Two players
 * stake credits head-to-head at agreed odds; the winner takes the whole pot; the HOUSE TAKES
 * NOTHING. There is no book, no vig, no margin — just two opposing positions and a pot.
 *
 * The money never lives here. A challenge only DESCRIBES the matchup (who, what, the two
 * stakes, the agreed odds); every credit moves through the shared `core` (place/resolve) via
 * p2p/escrow.ts. The two integer stakes are the source of truth for settlement — the pot is
 * their sum and the winner takes all of it, so the math is automatically zero-sum (the loser's
 * stake is exactly the winner's profit). `decimalOdds` is the agreed display price only; it is
 * NEVER used to settle (rounding can't leak credits because settlement reads the real stakes).
 *
 * Credits/balance only — no cash, no cash value, no withdrawal.
 */

import type { ComponentType } from 'react'
import type { Account } from '../core/index.js'
import type { Role } from '../org/index.js'

/**
 * Lifecycle of a challenge:
 *   open     — proposed, awaiting an accepter. NO money held.
 *   accepted — both stakes escrowed via core (pending), in-flight, awaiting the result.
 *   settled  — graded from the real result; the pot was paid to the winner via core.
 *   declined — a directed (friend) offer the invitee turned down. NO money was held.
 *   expired  — no one accepted before `expiresAt`. NO money was held.
 *   voided   — an accepted challenge cancelled (e.g. event abandoned); BOTH stakes refunded.
 */
export type ChallengeStatus = 'open' | 'accepted' | 'settled' | 'declined' | 'expired' | 'voided'

/** Which side won a settled challenge. */
export type ChallengeWinner = 'proposer' | 'accepter'

/** Who may accept: anyone in the community, or one invited friend. */
export type ChallengeAudience = 'open' | 'friend'

/** One side's identity in a challenge (no account here — accounts live in core). */
export interface Challenger {
  playerId: string
  playerName: string
}

/**
 * A head-to-head, no-vig challenge. The proposer backs `proposerPick` for `proposerStakeCents`;
 * the accepter takes the other side (`accepterPick`) for `accepterStakeCents`. The winner takes
 * the pot (`proposerStakeCents + accepterStakeCents`). No house cut at any point.
 */
export interface Challenge {
  id: string
  proposer: Challenger
  /** Set when accepted. For a directed (friend) offer this is the invited player even while
   *  still `open` (so the invitee knows it's for them); cleared back to the invitee on decline. */
  accepter?: Challenger
  /** Short title of the matchup, e.g. "Lakers cover -3.5 tonight". */
  title: string
  /** What the proposer is backing (display). */
  proposerPick: string
  /** The opposing position the accepter takes (display). */
  accepterPick: string
  /** The proposer's stake, integer cents (credits). */
  proposerStakeCents: number
  /** The accepter's stake, integer cents — derived from the agreed odds (even money ⇒ equal). */
  accepterStakeCents: number
  /** The proposer's agreed decimal odds (> 1; 2.0 = even money). Implies the stake ratio.
   *  DISPLAY ONLY — settlement uses the stored integer stakes, never this. */
  decimalOdds: number
  audience: ChallengeAudience
  /** For a directed (friend) challenge, the player it's offered to. */
  targetPlayerId?: string
  status: ChallengeStatus
  createdAt: number
  /** Open offers auto-expire at this time if unaccepted. */
  expiresAt: number
  /** Set once settled. */
  winner?: ChallengeWinner
  settledAt?: number
}

/* ─────────────────────── player-section descriptor seam ─────────────────────
 * Same self-describing pattern social/ uses for its Community section (round-2): this module
 * exports a `challengesSection` DESCRIPTOR (p2p/index.ts) rather than editing the app shell or
 * the player-section registry. Agent D is making app/player-sections.ts prop-aware; the WIRING
 * PASS mounts this descriptor (and C's) through D's new registry. See the // SEAM in index.ts.
 */

/** Props the app shell passes a player-facing section (mirrors social's PlayerSectionProps and
 *  how RewardsSection / BookView are mounted: the viewer's id, name, and core Account). */
export interface PlayerSectionProps {
  viewerId: string
  viewerName: string
  account: Account
  /** Let the shell refresh the figure after a challenge moves it (like BookView's). */
  onBalanceChange?: () => void
}

/** A self-describing player section a module exposes for the shell/wiring to mount. */
export interface PlayerSectionDescriptor {
  id: string
  label: string
  roles: Role[]
  Component: ComponentType<PlayerSectionProps>
}
