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
import { getEconomyMode, getBalanceFloorCents } from './economy.js'
import { assertWithinLimits } from './limits.js'

/**
 * How a wager id is minted when the caller doesn't supply one. The default is an
 * in-memory sequence — fine for the demo, but it RESETS on reload and isn't safe
 * across multiple instances / a server process, so ids can collide once wagers are
 * durable (issue #6). A backend plugs in a collision-free source (DB sequence /
 * UUID) via `setWagerIdFactory`, keeping the mint point in core instead of every
 * caller inventing its own ids. `placeWager` still honours an explicit `id` arg.
 */
let wagerSeq = 0
const defaultWagerIdFactory = (): string => {
  wagerSeq += 1
  return `w_${wagerSeq}`
}
let wagerIdFactory: () => string = defaultWagerIdFactory

/** Mint a unique wager id when the caller doesn't supply one. */
function nextWagerId(): string {
  return wagerIdFactory()
}

/**
 * Override how unsupplied wager ids are minted — e.g. a backend supplies DB-backed
 * or UUID ids that are unique across instances and survive a restart. Only changes
 * the fallback; an explicit `id` passed to `placeWager` always wins.
 */
export function setWagerIdFactory(factory: () => string): void {
  wagerIdFactory = factory
}

/** Restore the default in-memory sequence and zero the counter (tests). */
export function __resetWagerIds(): void {
  wagerSeq = 0
  wagerIdFactory = defaultWagerIdFactory
}

/* ----------------------- resolution event (the ledger) ------------------ */

/** Emitted whenever a wager resolves — the hook every bet flows through, so a
 *  ledger/transaction log can record across all games without touching them. */
export interface ResolveEvent {
  /** Which account's figure moved — so a ledger / org roll-up can attribute it
   *  to the right player (without this, a subscriber can't tell whose bet it was). */
  accountId: string
  /** The resolved wager's id — lets a subscriber match a resolution back to its
   *  placement (e.g. to attribute it to the product it was PLACED on, not whatever
   *  screen happens to be active when it grades). */
  wagerId: string
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

/* ------------------------- placement event ------------------------------ */

/** Emitted when a wager is PLACED (the hold goes on). Pairs with `onWagerResolved`
 *  by `wagerId`, so a subscriber can capture the product/context at placement time
 *  (the screen the bet was actually made on) and carry it through to resolution —
 *  what per-game exposure + accurate per-game attribution need. */
export interface PlaceEvent {
  accountId: string
  wagerId: string
  stake: number
}

type PlaceListener = (e: PlaceEvent) => void
const placeListeners = new Set<PlaceListener>()

/** Subscribe to wager placements. Returns an unsubscribe fn. */
export function onWagerPlaced(listener: PlaceListener): () => void {
  placeListeners.add(listener)
  return () => {
    placeListeners.delete(listener)
  }
}

function emitPlaced(e: PlaceEvent): void {
  // A logging listener must never be able to break placement.
  for (const l of placeListeners) {
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

/* ------------------------- weekly settlement (squaring up) --------------- */

/**
 * Emitted when an account is squared up at `settleWeek` — BEFORE the figure is
 * zeroed — so the ledger keeps an auditable record of what was paid in/out each
 * week instead of the reset silently swallowing it (issue #3). `settleWeek` also
 * returns this record so a synchronous caller can persist it directly.
 */
export interface SettlementRecord {
  accountId: string
  /**
   * The figure squared up, signed as the account carried it: positive = the book
   * owed the player (paid out), negative = the player owed the book (paid in).
   */
  closingBalance: number
  /** Which way money moved to flatten the book. `flat` = nothing owed either way. */
  direction: 'paid_in' | 'paid_out' | 'flat'
  /** Optional caller-supplied label for the cycle being closed (e.g. ISO week). */
  week?: string
  /** When the settlement ran (ms since epoch). */
  timestamp: number
}

type SettlementListener = (e: SettlementRecord) => void
const settlementListeners = new Set<SettlementListener>()

/** Subscribe to weekly settlements. Returns an unsubscribe fn. */
export function onSettlement(listener: SettlementListener): () => void {
  settlementListeners.add(listener)
  return () => {
    settlementListeners.delete(listener)
  }
}

function emitSettlement(e: SettlementRecord): void {
  // A logging listener must never be able to break settlement.
  for (const l of settlementListeners) {
    try {
      l(e)
    } catch {
      /* ignore */
    }
  }
}

/**
 * How much the player may put at risk right now. Branches on the economy mode (§3):
 *   - credit  (default): creditLimit + balance − pending — the figure may run down to −limit.
 *   - balance:           balance − pending − balanceFloor — no credit line, so you can only
 *                        risk credits you actually hold, and a wager can never drive the
 *                        balance below the floor (default 0 = a non-negative wallet).
 * A wager is only accepted if it fits inside this. In the default credit mode the formula is
 * unchanged, so existing behaviour is byte-for-byte identical.
 */
export function availableToWager(account: Account): number {
  if (getEconomyMode() === 'balance') {
    return account.balance - account.pending - getBalanceFloorCents()
  }
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
  // Responsible-play gate: the player's own wager/loss cap or cool-off (no-op if none set,
  // so default placement is byte-identical). Mirrors the economy-floor consultation above.
  assertWithinLimits(account, stake)
  const available = availableToWager(account)
  if (stake > available) {
    throw new Error(`stake ${stake} exceeds availableToWager ${available}`)
  }
  if (account.maxWager != null && stake > account.maxWager) {
    // Player-facing (games show this verbatim), so no raw cents in the text.
    throw new Error('stake exceeds the max bet')
  }
  if (account.minWager != null && stake < account.minWager) {
    throw new Error('stake is below the minimum bet')
  }

  account.pending += stake

  const wager: Wager = {
    id: id ?? nextWagerId(),
    accountId: account.id,
    stake,
    status: 'open',
  }
  emitPlaced({ accountId: account.id, wagerId: wager.id, stake })
  return wager
}

/**
 * Place several wagers as ONE all-or-nothing batch — hold every stake or none.
 * If any stake fails `placeWager`'s checks (doesn't fit `availableToWager`, trips
 * a per-head min/max, betting is locked, non-integer …), the holds already taken
 * in this call are released and the original error is rethrown, leaving the
 * account exactly as it started. The release goes through the normal void path,
 * so any place/resolve subscriber (exposure, ledger) stays balanced.
 *
 * This is the safe way for a multi-leg round (Sic Bo's bets, Three Card Poker's
 * ante + pair plus) to place its legs: without it, a stake that doesn't fit after
 * earlier legs were held would strand those holds in `pending` forever.
 */
export function placeWagers(account: Account, stakes: number[]): Wager[] {
  const placed: Wager[] = []
  try {
    for (const stake of stakes) placed.push(placeWager(account, stake))
    return placed
  } catch (err) {
    // Roll back every hold taken in THIS batch (void releases pending, no balance
    // change), so a partial failure is invisible to the figure.
    for (const w of placed) resolveWager(account, w, 'void')
    throw err
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

  // A win must carry a valid multiplier. Validate this BEFORE touching the
  // account, so a bad call can never half-settle the wager — release the hold
  // (pending) without grading it, which would silently corrupt the figure.
  if (outcome === 'win' && (payoutMultiplier === undefined || payoutMultiplier <= 1)) {
    throw new Error(`a win needs a payoutMultiplier > 1, got ${payoutMultiplier}`)
  }

  // Release the hold regardless of outcome.
  account.pending -= wager.stake

  let profit = 0
  let mult = 1 // push / void return the stake (1×)
  if (outcome === 'win') {
    // payoutMultiplier is guaranteed > 1 by the guard above.
    profit = Math.round(wager.stake * (payoutMultiplier! - 1))
    let effMult = payoutMultiplier!
    if (account.maxPayout != null && profit > account.maxPayout) {
      profit = account.maxPayout // operator cap on the win
      effMult = wager.stake > 0 ? 1 + profit / wager.stake : payoutMultiplier! // record the EFFECTIVE multiple
    }
    account.balance += profit
    wager.payoutMultiplier = effMult
    mult = effMult
  } else if (outcome === 'loss') {
    account.balance -= wager.stake
    profit = -wager.stake
    mult = 0
  }
  // push / void: stake returned, balance unchanged.

  wager.status = 'resolved'
  wager.outcome = outcome
  emitResolved({
    accountId: account.id,
    wagerId: wager.id,
    stake: wager.stake,
    outcome,
    payoutMultiplier: mult,
    profit,
  })
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
  let profit = Math.round(wager.stake * (m - 1))
  let effMult = m
  if (account.maxPayout != null && profit > account.maxPayout) {
    profit = account.maxPayout // operator cap on the win
    effMult = wager.stake > 0 ? 1 + profit / wager.stake : m // record the EFFECTIVE multiple
  }
  account.balance += profit

  wager.status = 'resolved'
  wager.outcome = m > 1 ? 'win' : m < 1 ? 'loss' : 'push'
  wager.payoutMultiplier = effMult
  emitResolved({
    accountId: account.id,
    wagerId: wager.id,
    stake: wager.stake,
    outcome: wager.outcome,
    payoutMultiplier: effMult,
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
 *
 * Before zeroing, it captures a `SettlementRecord` of what was squared up, emits
 * it on the settlement channel (so the ledger can persist it), and returns it —
 * so a weekly reset always leaves an auditable trail instead of silently dropping
 * the closing figure (issue #3). `opts.week` tags the cycle being closed;
 * `opts.now` overrides the timestamp (handy for deterministic tests/backfills).
 */
export function settleWeek(
  account: Account,
  opts?: { week?: string; now?: number },
): SettlementRecord {
  if (account.pending !== 0) {
    throw new Error(`cannot settle with ${account.pending} still pending; grade all wagers first`)
  }
  const closingBalance = account.balance
  const record: SettlementRecord = {
    accountId: account.id,
    closingBalance,
    direction: closingBalance > 0 ? 'paid_out' : closingBalance < 0 ? 'paid_in' : 'flat',
    week: opts?.week,
    timestamp: opts?.now ?? Date.now(),
  }
  account.balance = 0
  emitSettlement(record)
  return record
}

/**
 * Manually move an account's figure by `delta` — a manager re-credit, correction, or
 * comp — OUTSIDE the wager flow, so it touches only `balance`, never `pending`. The
 * `delta` may be negative (a debit). This is a deliberate operator override and is NOT
 * bounded by the credit limit (a correction can legitimately push past it); the audit
 * trail of who/why is recorded by the caller (the ledger), keeping core money-only.
 * Throws on a non-integer delta.
 */
export function adjustBalance(account: Account, delta: number): void {
  if (!Number.isInteger(delta)) {
    throw new Error(`adjustment must be a whole number of points, got ${delta}`)
  }
  account.balance += delta
}
