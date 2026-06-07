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
  /**
   * Optional per-head cap on a SINGLE wager (the operator's "max bet"), in the
   * same unit as `stake`. Undefined = no per-bet cap, so only the credit limit
   * bounds play. Set by the management/org layer and enforced in `placeWager`,
   * so every game and the sportsbook honour it without their own checks.
   */
  maxWager?: number
  /**
   * Optional per-head MINIMUM on a single wager (the operator's "min bet"). Undefined
   * = no floor beyond the 1-unit positivity rule. Enforced in `placeWager`, so every
   * game and the sportsbook honour it without their own checks.
   */
  minWager?: number
  /**
   * Optional per-head MAX PAYOUT cap — the most a single winning bet may PROFIT
   * (the win amount, on top of the returned stake). A win is capped to this; it never
   * makes a win lose. Undefined = uncapped. Enforced in `resolveWager` /
   * `resolveAtMultiplier`, so the cap holds across every game and the sportsbook.
   */
  maxPayout?: number
  /**
   * The operator's "no new action" switch. When true the account keeps its figure
   * and can still be settled/cashed out, but `placeWager` refuses any NEW bet — so
   * a manager can freeze a player's betting (hit their limit, late action, dispute)
   * without taking them off the book. Enforced in `placeWager`, so every game and
   * the sportsbook honour it with no per-module checks. Undefined/false = open.
   */
  bettingLocked?: boolean
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
