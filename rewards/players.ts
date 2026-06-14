/**
 * Per-player rewards STATE + the actions that move it (CLAUDE.md §4). Persisted, keyed by
 * book member id, so every player's status/bonuses survive a reload and the operator can
 * report on them.
 *
 * BALANCE & STATUS ONLY — three kinds of value, none of them cash or withdrawable:
 *   - STATUS    — monotonic points that drive the tier ladder. Only ever goes up.
 *   - CASHBACK  — accrues as a % of the amount WAGERED; claimed into the player's BALANCE.
 *   - LOCKED    — bonus balance from promos/top-ups/comps that unlocks to the player's
 *                 regular BALANCE after a play-through requirement (NEVER a cash-out
 *                 condition). The matured amount is returned for the host to credit.
 *
 * The regular BALANCE (the betting figure) lives in the shared core account, not here; this
 * module returns the amount to credit when a locked bonus matures or cashback pays out, and
 * the host moves it through core. Comps credit the player's figure directly (see comp.ts).
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import { getRewardsConfig } from './economy.js'

export interface LockedBonus {
  id: string
  /** Balance units that unlock to the regular figure once cleared. */
  amount: number
  /** Units that must be wagered to unlock (amount × promo playthrough). */
  wagerRequired: number
  /** Units wagered toward the requirement so far. */
  wagered: number
  /** Where it came from (a promo name, a comp, a top-up). */
  source: string
}

export type CompKind = 'balance' | 'freeplay' | 'limitboost' | 'badge'
export interface CompRecord {
  id: string
  /** Who granted it (member id) + a display label. */
  by: string
  byName: string
  kind: CompKind
  /** Balance units (for 'balance'/'freeplay' stake) or 0 for badge/limit. */
  amount: number
  reason: string
  at: number
}

export interface PlayerRewardState {
  status: number // monotonic tier points
  cashbackPending: number // accrued, claim → the player's balance
  locked: LockedBonus[]
  compHistory: CompRecord[]
  /** Mission/promo/daily one-time claim markers. */
  claimedIds: string[]
  /** Last daily-claim cycle day (1..7) and whether claimed "today" (demo: a flag). */
  dailyDay: number
  dailyClaimedToday: boolean
  contestEntries: string[]
}

function blankState(): PlayerRewardState {
  return {
    status: 0,
    cashbackPending: 0,
    locked: [],
    compHistory: [],
    claimedIds: [],
    dailyDay: 1,
    dailyClaimedToday: false,
    contestEntries: [],
  }
}

/* --------------------------- seeded demo players --------------------------- */
// Realistic spread so the manager/agent reporting + the player view render populated.
// (Status drives tier: Bronze 1k / Silver 10k / Gold 50k / Platinum 250k / Diamond 1M.)

const SEED: Record<string, PlayerRewardState> = {
  'p-marco': {
    status: 68_400,
    cashbackPending: 420,
    locked: [{ id: 'lb-marco-1', amount: 5_000, wagerRequired: 5_000, wagered: 3_100, source: 'Weekend Reload' }],
    compHistory: [
      { id: 'c1', by: 'a-e', byName: 'East Desk', kind: 'balance', amount: 1_000, reason: 'Loyalty — rough week', at: 1_749_900_000_000 },
    ],
    claimedIds: [],
    dailyDay: 5,
    dailyClaimedToday: false,
    contestEntries: ['contest-weekly-profit'],
  },
  'p-lena': {
    status: 142_000,
    cashbackPending: 1_120,
    locked: [],
    compHistory: [],
    claimedIds: [],
    dailyDay: 2,
    dailyClaimedToday: true,
    contestEntries: ['contest-weekly-profit'],
  },
  'p-tariq': {
    status: 8_900,
    cashbackPending: 90,
    locked: [{ id: 'lb-tariq-1', amount: 2_000, wagerRequired: 2_000, wagered: 250, source: 'Comp — welcome back' }],
    compHistory: [
      { id: 'c2', by: 'a-w', byName: 'West Desk', kind: 'balance', amount: 2_000, reason: 'Welcome back bonus', at: 1_749_950_000_000 },
    ],
    claimedIds: [],
    dailyDay: 1,
    dailyClaimedToday: false,
    contestEntries: [],
  },
  'p-priya': {
    status: 21_500,
    cashbackPending: 210,
    locked: [],
    compHistory: [],
    claimedIds: [],
    dailyDay: 3,
    dailyClaimedToday: false,
    contestEntries: ['contest-weekly-profit'],
  },
  'p-dana': {
    status: 540_000,
    cashbackPending: 3_400,
    locked: [{ id: 'lb-dana-1', amount: 10_000, wagerRequired: 10_000, wagered: 9_500, source: 'VIP comp' }],
    compHistory: [
      { id: 'c3', by: 'mgr', byName: 'Operator', kind: 'balance', amount: 10_000, reason: 'VIP host — Diamond care', at: 1_749_990_000_000 },
      { id: 'c4', by: 'mgr', byName: 'Operator', kind: 'freeplay', amount: 500, reason: 'Crash free plays', at: 1_749_995_000_000 },
    ],
    claimedIds: [],
    dailyDay: 7,
    dailyClaimedToday: false,
    contestEntries: ['contest-weekly-profit'],
  },
}

/* ------------------------------- the store --------------------------------- */

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<Record<string, PlayerRewardState>> = persistedDoc<Record<string, PlayerRewardState>>(
  store,
  'rewards.players',
  // v2: dropped the separate "spendable" wallet — rewards credit the real balance now.
  { version: 2, initial: SEED },
)

let states: Record<string, PlayerRewardState> = DOC.load() ?? SEED
let version = 0
const listeners = new Set<() => void>()
function notify(): void {
  DOC.save(states)
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeRewardsPlayers(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getRewardsPlayersVersion(): number {
  return version
}

/** A player's reward state (a fresh blank one if they have none yet). */
export function getPlayerRewards(memberId: string): PlayerRewardState {
  return states[memberId] ?? blankState()
}

function set(memberId: string, next: PlayerRewardState): void {
  states = { ...states, [memberId]: next }
  notify()
}
function mutate(memberId: string, fn: (s: PlayerRewardState) => PlayerRewardState): void {
  set(memberId, fn(getPlayerRewards(memberId)))
}

/* ------------------------------- play accrual ------------------------------ */

/**
 * Apply one wager's worth of play: status climbs by the stake, cashback accrues at the
 * configured rate, and every locked bonus advances toward its play-through. Returns the
 * balance that just UNLOCKED to the regular figure (the host credits it through core).
 */
export function accrueFromWager(memberId: string, stake: number): { unlocked: number } {
  if (stake <= 0) return { unlocked: 0 }
  const rate = getRewardsConfig().economy.cashbackRate
  let unlocked = 0
  mutate(memberId, (s) => {
    const locked: LockedBonus[] = []
    for (const b of s.locked) {
      const wagered = b.wagered + stake
      if (wagered >= b.wagerRequired) unlocked += b.amount
      else locked.push({ ...b, wagered })
    }
    return {
      ...s,
      status: s.status + stake,
      cashbackPending: s.cashbackPending + Math.round(stake * rate),
      locked,
    }
  })
  return { unlocked }
}

/** Claim accrued cashback. Zeroes the pending balance and returns the amount for the host
 *  to credit to the player's regular figure. */
export function claimCashback(memberId: string): number {
  const s = getPlayerRewards(memberId)
  const amt = s.cashbackPending
  if (amt <= 0) return 0
  set(memberId, { ...s, cashbackPending: 0 })
  return amt
}

/** Grant a locked bonus (a promo / top-up / comp). It unlocks to the regular balance only
 *  after `amount × playthrough` is wagered. playthrough 0 → unlocks instantly (returned for
 *  immediate credit). Returns the amount to credit now (0 unless instant). */
export function grantLockedBonus(
  memberId: string,
  amount: number,
  playthrough: number,
  source: string,
  id = `lb-${memberId}-${source}`,
): { instant: number } {
  if (amount <= 0) return { instant: 0 }
  if (playthrough <= 0) return { instant: amount } // no lock — host credits the balance
  mutate(memberId, (s) => ({
    ...s,
    locked: [...s.locked, { id, amount, wagerRequired: amount * playthrough, wagered: 0, source }],
  }))
  return { instant: 0 }
}

/** Add monotonic status points (never decreases). */
export function addStatus(memberId: string, points: number): void {
  if (points <= 0) return
  mutate(memberId, (s) => ({ ...s, status: s.status + points }))
}

/** Mark a one-time reward (mission/promo/daily) claimed. */
export function markClaimed(memberId: string, id: string): void {
  mutate(memberId, (s) => (s.claimedIds.includes(id) ? s : { ...s, claimedIds: [...s.claimedIds, id] }))
}
export function isClaimed(memberId: string, id: string): boolean {
  return getPlayerRewards(memberId).claimedIds.includes(id)
}

/** Record a comp handed to a player by an operator/agent (the audit of what was given).
 *  The figure credit itself happens in comp.ts through the core money path. */
export function recordComp(memberId: string, rec: Omit<CompRecord, 'id' | 'at'>, at: number): void {
  mutate(memberId, (s) => ({
    ...s,
    compHistory: [{ ...rec, id: `comp-${at}-${memberId}`, at }, ...s.compHistory],
  }))
}

export function enterContest(memberId: string, contestId: string): void {
  mutate(memberId, (s) =>
    s.contestEntries.includes(contestId) ? s : { ...s, contestEntries: [...s.contestEntries, contestId] },
  )
}

/** All known reward states (for operator reporting). */
export function allPlayerRewards(): Record<string, PlayerRewardState> {
  return states
}

/** Test helper: restore the seeded states. */
export function __resetRewardsPlayers(): void {
  states = SEED
  notify()
}
