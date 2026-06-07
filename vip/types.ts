/**
 * VIP ranks + leaderboard + free-play — types (the public contract the UI is
 * written against). This module tracks/derives numbers and owns its own config +
 * per-player VIP state; it NEVER moves money. Money still only ever flows through
 * `core`. "Free play" is a promo pool the manager grants here; REDEEMING it (which
 * credits a player's core Account.balance) is done by the app integration layer,
 * not in this feature.
 *
 * Everything is integer CENTS (1/100 of a point), matching games/shared/money.ts.
 */

/** The rank ladder, ordered lowest → highest. */
export type RankId = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

/** One rung of the ladder. Thresholds are LIFETIME WAGERED, in cents. */
export interface RankDef {
  id: RankId
  name: string
  /** Hex color for the badge/UI accent. */
  color: string
  /** Lifetime wagered (cents) needed to reach this rank. */
  minWagered: number
  /** Free-play granted (cents) the first time this rank is reached. */
  freePlayReward: number
  perks: string[]
}

/** The manager-owned VIP program config. `ranks` is ordered none..diamond. */
export interface VipConfig {
  /** Whether the program is live to players. */
  released: boolean
  /** When true, rewards are granted automatically as ranks are reached. */
  autoGrant: boolean
  ranks: RankDef[]
}

/** Per-player VIP state. All cents. */
export interface PlayerVip {
  /** Lifetime wagered (cents) accumulated across every settled wager. */
  wagered: number
  /** Ranks whose reward has already been granted (so grants are idempotent). */
  claimedRanks: RankId[]
  /** Free-play balance (cents) waiting to be redeemed into the core balance. */
  freePlay: number
}

/** A player's standing toward the next rank. */
export interface RankProgress {
  current: RankDef
  /** null when the player is already at the top rank. */
  next: RankDef | null
  /** Fraction 0..1 toward `next` (1 at the top rank). */
  pct: number
  /** Cents still to wager to reach `next` (0 at the top rank). */
  remaining: number
}

/** A single leaderboard entry. */
export interface LeaderboardRow {
  /** 1-based standing (1 = most wagered). */
  position: number
  id: string
  name: string
  wagered: number
  rank: RankDef
  freePlay: number
}
