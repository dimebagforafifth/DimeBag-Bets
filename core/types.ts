/**
 * Core money-model types (CLAUDE.md §3).
 *
 * This is THE shared contract. Every game and the sportsbook express themselves
 * through a generic `stake`, an `Outcome`, and a `payoutMultiplier` — no
 * game-specific concepts (Mines tiles, Crash multipliers, parlays) live here.
 *
 * Points are integers (the smallest unit). They may be displayed with a "$" but
 * carry no monetary value: a closed loop, no buy-in, no cash-out.
 */

/** A player account — the per-account state the whole app shares. */
export interface Account {
  id: string
  /** How far the player may go down: the most they can owe before settling. */
  creditLimit: number
  /**
   * The "figure": running standing. Wins push it positive (book owes player),
   * losses pull it down (player owes book), never past the credit limit.
   */
  balance: number
  /** Total of wagers currently at risk (placed but not yet graded). */
  pending: number
}

/** How a wager is graded when it resolves. */
export type Outcome = 'win' | 'loss' | 'push' | 'void'

/** Lifecycle state of a wager. */
export type WagerStatus = 'open' | 'resolved'

/**
 * A single wager. Generic by design: a stake at risk, later graded with an
 * outcome and (for wins) a payout multiplier.
 */
export interface Wager {
  id: string
  accountId: string
  stake: number
  status: WagerStatus
  /** Set once resolved. */
  outcome?: Outcome
  /** The multiplier used to grade a win (e.g. 2.5 means stake × 2.5 returned). */
  payoutMultiplier?: number
}
