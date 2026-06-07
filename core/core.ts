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

/* ----------------------- resolution event (the ledger) ------------------ */

/** Emitted whenever a wager resolves — the hook every bet flows through, so a
 *  ledger/transaction log can record across all games without touching them. */
export interface ResolveEvent {
  /** Which account's figure moved — so a ledger / org roll-up can attribute it
   *  to the right player (without this, a subscriber can't tell whose bet it was). */
  accountId: string
  stake: number
  outcome: Outcome
  /** 0 for a loss, 1 for push/void, the multiplier for a win/settle. */
  payoutMultiplier: number
  /** Signed change to the figure (profit, negative on a loss). */
  profit: number
}

type ResolveListener = (e: ResolveEvent) => void
const resolveListeners = new Set<ResolveListener>()

/** Subscribe to wager resolutions. Returns an unsubscribe fn. */
export function onWagerResolved(listener: ResolveListener): () => void {
  resolveListeners.add(listener)
  return () => {
    resolveListeners.delete(listener)
  }
}

function emitResolved(e: ResolveEvent): void {
  // A logging listener must never be able to break settlement.
  for (const l of resolveListeners) {
    try {
      l(e)
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------- bonus grant (the house gives) ----------------- */

/**
 * Emitted when the operator GRANTS a bonus (free play / point bonus) to a player.
 * A grant is NOT a wager — no stake, no pending — so it rides its own channel
 * rather than `onWagerResolved`, keeping bonuses out of turnover/win-rate while
 * still letting the ledger and operator analytics record the promo.
 */
export interface GrantEvent {
  accountId: string
  /** Points credited (cents); always positive. */
  cents: number
  /** Optional context (e.g. { promo: 'welcome', by: 'mgr' }). */
  meta?: Record<string, unknown>
}

type GrantListener = (e: GrantEvent) => void
const grantListeners = new Set<GrantListener>()

/** Subscribe to bonus grants. Returns an unsubscribe fn. */
export function onGrant(listener: GrantListener): () => void {
  grantListeners.add(listener)
  return () => {
    grantListeners.delete(listener)
  }
}

function emitGrant(e: GrantEvent): void {
  for (const l of grantListeners) {
    try {
      l(e)
    } catch {
      /* ignore */
    }
  }
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
 * The most a single wager may be: what's available, further capped by the
 * operator's per-head max bet if one is set. Games can clamp their bet input to
 * this; `placeWager` enforces it regardless.
 */
export function maxBet(account: Account): number {
  const available = availableToWager(account)
  return account.maxWager != null ? Math.min(available, account.maxWager) : available
}

/**
 * Place a wager: validate the stake fits, hold it in `pending`, return an open
 * wager. Throws if the stake is non-positive, non-integer, exceeds what's
 * available (which already accounts for the credit limit), or exceeds the
 * per-head max bet (if the operator set one).
 */
export function placeWager(account: Account, stake: number, id?: string): Wager {
  if (!Number.isInteger(stake)) {
    throw new Error(`stake must be a whole number of points, got ${stake}`)
  }
  if (stake <= 0) {
    throw new Error(`stake must be positive, got ${stake}`)
  }
  if (account.bettingLocked) {
    // Player-facing (games/sportsbook show this verbatim): a manager has frozen
    // new action on this account. Existing bets still settle.
    throw new Error('betting is locked on this account')
  }
  const available = availableToWager(account)
  if (stake > available) {
    throw new Error(`stake ${stake} exceeds availableToWager ${available}`)
  }
  if (account.maxWager != null && stake > account.maxWager) {
    // Player-facing (games show this verbatim), so no raw cents in the text.
    throw new Error('stake exceeds the max bet')
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

  let profit = 0
  let mult = 1 // push / void return the stake (1×)
  if (outcome === 'win') {
    if (payoutMultiplier === undefined || payoutMultiplier <= 1) {
      throw new Error(`a win needs a payoutMultiplier > 1, got ${payoutMultiplier}`)
    }
    profit = Math.round(wager.stake * (payoutMultiplier - 1))
    account.balance += profit
    wager.payoutMultiplier = payoutMultiplier
    mult = payoutMultiplier
  } else if (outcome === 'loss') {
    account.balance -= wager.stake
    profit = -wager.stake
    mult = 0
  }
  // push / void: stake returned, balance unchanged.

  wager.status = 'resolved'
  wager.outcome = outcome
  emitResolved({ accountId: account.id, stake: wager.stake, outcome, payoutMultiplier: mult, profit })
}

/**
 * Settle a wager at an arbitrary return multiplier `m ≥ 0`: the player gets back
 * `stake × m`, so the figure moves by the same generic rule as a win,
 * `profit = stake × (m − 1)` — which is negative for `m < 1` (a partial loss),
 * zero for `m = 1` (a push), and positive for `m > 1` (a win).
 *
 * This is the generic settlement casino games like Plinko need (most slots pay a
 * fraction or a small multiple, not all-or-nothing) and that sportsbook cashouts
 * will reuse. It releases the hold and tags the outcome to match `m`, keeping the
 * money model in one place (§3). `resolveWager` stays the win/loss/push/void path.
 */
export function resolveAtMultiplier(account: Account, wager: Wager, m: number): void {
  if (wager.status === 'resolved') {
    throw new Error(`wager ${wager.id} is already resolved`)
  }
  if (wager.accountId !== account.id) {
    throw new Error(`wager ${wager.id} does not belong to account ${account.id}`)
  }
  if (!Number.isFinite(m) || m < 0) {
    throw new Error(`multiplier must be a finite number ≥ 0, got ${m}`)
  }

  account.pending -= wager.stake
  const profit = Math.round(wager.stake * (m - 1))
  account.balance += profit

  wager.status = 'resolved'
  wager.outcome = m > 1 ? 'win' : m < 1 ? 'loss' : 'push'
  wager.payoutMultiplier = m
  emitResolved({
    accountId: account.id,
    stake: wager.stake,
    outcome: wager.outcome,
    payoutMultiplier: m,
    profit,
  })
}

/**
 * Grant a bonus to a player — the ONE sanctioned way to credit free play / point
 * bonuses to the figure, so the money model stays in one place (§3) instead of
 * callers poking `account.balance` directly. It is NOT a wager: no stake, no
 * pending, no `availableToWager` check (the house is giving, not risking). The
 * balance rises by `cents` and a `GrantEvent` fires so the ledger / operator
 * analytics record the promo. Throws on a non-positive or non-integer amount.
 */
export function grant(account: Account, cents: number, meta?: Record<string, unknown>): void {
  if (!Number.isInteger(cents)) {
    throw new Error(`grant must be a whole number of points, got ${cents}`)
  }
  if (cents <= 0) {
    throw new Error(`grant must be positive, got ${cents}`)
  }
  account.balance += cents
  emitGrant({ accountId: account.id, cents, meta })
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
