/**
 * Betting pools + user-created leagues — the domain model.
 *
 * A POOL is a competition with a format plugin (pick'em / confidence / survivor / bracket /
 * squares); a LEAGUE is a season-scoped pool with weekly scoring rounds. Entries debit CREDITS
 * via core into an escrow hold and prizes pay back through core's pool-conserving allocator, so
 * total in == total out (minus an operator-configured rake, itself granted through core).
 *
 * CARDINAL RULE: standings are READ-ONLY projections over settled pool activity — they reconcile
 * to the ledger and NEVER write a credit. The only money paths are entry (hold) and settle/void
 * (collect → grant / refund), all through core in integer cents.
 */

import type { Wager } from '../core/index.js'
import type { PoolConfig, PoolPicks, PoolResults } from './formats/types.js'

/** The format plugins. 'prop' is reserved in the schema; the five built formats are the rest. */
export type PoolKind = 'pickem' | 'confidence' | 'survivor' | 'bracket' | 'squares' | 'prop'

/** event = a single fixture/slate; season = a league played over weekly rounds. */
export type PoolScope = 'event' | 'season'

/** Who can see + join: anyone, invite-code/list only, or the creator's follow graph. */
export type PoolPrivacy = 'public' | 'invite' | 'friends'

/**
 * Lifecycle: open (accepting entries) → locked (at lock_at, picks frozen) → scoring (results
 * arriving) → settled (collected + paid). void is a terminal refund branch (under-filled or the
 * event cancelled) reachable from open/locked/scoring.
 */
export type PoolLifecycle = 'open' | 'locked' | 'scoring' | 'settled' | 'void'

/** A prize awarded to one account at settlement (the frozen, audited record). */
export interface PoolPayout {
  accountId: string
  name: string
  /** Display rank (1-based) for leaderboard formats; the scoring-period index for squares. */
  rank: number
  prizeCents: number
}

/** A betting pool / league. Money is integer cents (credits); standings derive from picks+results. */
export interface Pool {
  id: string
  tenantId: string
  /** A player id (user-created) or an operator id. */
  creatorId: string
  creatorName: string
  name: string
  kind: PoolKind
  scope: PoolScope
  privacy: PoolPrivacy
  /** Entry fee in credits (cents); 0 = free pool (operator-seeded prizes only). */
  entryCents: number
  /** Optional cap on entrants; null = unlimited. */
  maxEntries: number | null
  /** Min entrants for the pool to run; below this at lock → void + refund. */
  minEntries: number
  /** Operator guarantee added to the pool (credits) — funds free pools + overlays. */
  guaranteedCents: number
  /** Prize split: fractions of the prize pool by rank (index 0 = 1st), or per-period for squares. */
  prizeStructure: number[]
  /** Operator rake in basis points, taken off the pool before prizes (0 = no rake). */
  rakeBps: number
  /** The format config (games / teams / bracket / grid). Discriminated by kind. */
  config: PoolConfig
  /** Results posted by the operator/result feed (drives scoring). Absent until scoring. */
  results?: PoolResults
  lifecycle: PoolLifecycle
  /** Entries + picks lock at this epoch-ms. */
  lockAt: number
  createdAt: number
  /** Snapshotted at settle: the finalized pool + frozen payouts + rake (anti-drift). */
  prizePoolCents?: number
  rakeCents?: number
  payouts?: PoolPayout[]
  settledAt?: number
  voidedAt?: number
  voidReason?: string
  /** Display-only sample pool (seed): never joinable, never settles real money. */
  demo?: boolean
}

/** One player's entry into a pool. The core `wager` (the held entry fee) is the escrow leg;
 *  it is kept in memory (live session) and cleared on reload, like every open hold. */
export interface PoolEntry {
  id: string
  poolId: string
  accountId: string
  playerName: string
  joinedAt: number
  /** The held entry-fee wager (absent for free pools). Live ref, not persisted. */
  wager?: Wager
  stakeCents: number
  /** The entrant's picks for the format (frozen at lock). */
  picks: PoolPicks
}

/** An invite to a private pool (invite-code or directed at a player). */
export interface PoolInvite {
  id: string
  poolId: string
  /** Directed at one player, or a shareable code (playerId null). */
  playerId: string | null
  code: string
  createdAt: number
  acceptedAt?: number
}

/** A season-long league: a season-scoped pool scored over weekly rounds. */
export interface LeagueSeason {
  id: string
  poolId: string
  /** Number of weekly scoring rounds. */
  weeks: number
  /** Per-week scoring weight (defaults to equal); season standings = weighted sum. */
  scoringConfig: { weekWeights?: number[] }
  /** Results posted per week (week index → format results). */
  weekResults: Record<number, PoolResults>
}
