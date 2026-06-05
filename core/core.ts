/**
 * The shared credit/balance system (CLAUDE.md §3).
 *
 * The place → grade → adjust flow every module calls. Functions mutate the
 * passed `Account` in place, matching the contract signatures so the interface
 * stays stable as games and the sportsbook are built on top of it.
 *
 * No module tracks its own points — everything goes through here.
 */

import type { Account, Outcome, Wager } from './types.js'

let wagerSeq = 0

/** Mint a unique wager id when the caller doesn't supply one. */
function nextWagerId(): string {
  wagerSeq += 1
  return `w_${wagerSeq}`
}

/**
 * How much the player may put at risk right now:
 *   creditLimit + balance − pending
 * A wager is only accepted if it fits inside this.
 */
export function availableToWager(account: Account): number {
  return account.creditLimit + account.balance - account.pending
}

/**
 * Place a wager: validate the stake fits, hold it in `pending`, return an open
 * wager. Throws if the stake is non-positive, non-integer, or exceeds what's
 * available (which already accounts for the credit limit).
 */
export function placeWager(account: Account, stake: number, id?: string): Wager {
  if (!Number.isInteger(stake)) {
    throw new Error(`stake must be a whole number of points, got ${stake}`)
  }
  if (stake <= 0) {
    throw new Error(`stake must be positive, got ${stake}`)
  }
  const available = availableToWager(account)
  if (stake > available) {
    throw new Error(`stake ${stake} exceeds availableToWager ${available}`)
  }

  account.pending += stake

  return {
    id: id ?? nextWagerId(),
    accountId: account.id,
    stake,
    status: 'open',
  }
}

/**
 * Grade a wager and adjust the figure:
 *  - release the hold (pending −= stake), then
 *  - win:  balance += profit  (profit = stake × (payoutMultiplier − 1))
 *  - loss: balance −= stake
 *  - push / void: no change (stake effectively returned)
 *
 * Mutates both the account and the wager. Throws on double-resolve, on an
 * account/wager mismatch, or on a win without a valid (> 1) multiplier.
 */
export function resolveWager(
  account: Account,
  wager: Wager,
  outcome: Outcome,
  payoutMultiplier?: number,
): void {
  if (wager.status === 'resolved') {
    throw new Error(`wager ${wager.id} is already resolved`)
  }
  if (wager.accountId !== account.id) {
    throw new Error(`wager ${wager.id} does not belong to account ${account.id}`)
  }

  // Release the hold regardless of outcome.
  account.pending -= wager.stake

  if (outcome === 'win') {
    if (payoutMultiplier === undefined || payoutMultiplier <= 1) {
      throw new Error(`a win needs a payoutMultiplier > 1, got ${payoutMultiplier}`)
    }
    const profit = Math.round(wager.stake * (payoutMultiplier - 1))
    account.balance += profit
    wager.payoutMultiplier = payoutMultiplier
  } else if (outcome === 'loss') {
    account.balance -= wager.stake
  }
  // push / void: stake returned, balance unchanged.

  wager.status = 'resolved'
  wager.outcome = outcome
}

/**
 * Weekly settlement: the account squares up (negative balances pay in, positive
 * balances get paid) and then resets to zero for the new week. Requires no open
 * wagers — settle only after the week's bets are graded.
 */
export function settleWeek(account: Account): void {
  if (account.pending !== 0) {
    throw new Error(
      `cannot settle with ${account.pending} still pending; grade all wagers first`,
    )
  }
  account.balance = 0
}
