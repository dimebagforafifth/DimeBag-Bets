/**
 * Per-player rewards STATE + the real mechanics that move it (CLAIM/SPIN/REDEEM) — the
 * focused rewards hub. CREDITS & STATUS ONLY: every payout is credits to the player's real
 * balance (the figure), and warm-up unlocks to credits — never cash, never withdrawable.
 *
 * State is persisted per book member (survives refresh/session via the shared persistence
 * seam — Supabase when configured, else local). All amounts here are integer CENTS, matching
 * core's money model; rates/thresholds come from ONE config block (economy.ts `loyalty`).
 * Balance moves go through `adjustFigure` (the audited, persisted money path), so a claim is
 * real whether it came from the hub, the demo control, or a live wager.
 *
 * Mechanics:
 *   - recordWager / settleWager — every real wager grows lifetime `wagered` (rank), accrues
 *     RAKEBACK at the config rate, and advances the WARM-UP bonus; at its threshold the
 *     locked credits unlock to the balance.
 *   - claimRakeback — moves accrued rakeback into the balance.
 *   - dailyStatus / claimDaily — a real 24h cooldown + streak off the stored timestamp.
 *   - playFreeSpin — decrements the spin count and pays real credits.
 *   - redeemStoreItem — spends credits (can't overspend) and grants the item.
 */

import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import { getRewardsConfig, recordIssuance, type ProfitBoost } from './economy.js'
import { adjustFigure } from '../../app/manager-actions.js'
import { getBook } from '../../app/book-store.js'

/* --------------------------------- types ----------------------------------- */

export interface WarmupState {
  /** Locked credits (cents) that unlock once `wagered` reaches `required`. */
  locked: number
  /** Credits wagered so far toward the unlock (cents). */
  wagered: number
  /** Credits that must be wagered to unlock (cents). */
  required: number
}

export type CompKind = 'balance' | 'freeplay' | 'limitboost' | 'badge'
export interface CompRecord {
  id: string
  by: string
  byName: string
  kind: CompKind
  /** Whole credits (comps are tracked in credits, not cents). 0 for badge/limit. */
  amount: number
  reason: string
  at: number
}

export interface PlayerRewardState {
  /** Lifetime credits WAGERED (cents) — drives the rank/tier. */
  wagered: number
  /** Accrued, unclaimed RAKEBACK (cents). */
  rakebackAccrued: number
  /** Timestamp of the last daily claim (null = never). */
  lastDailyAt: number | null
  /** Consecutive-day streak. */
  streak: number
  /** Active warm-up bonus (locked credits unlocking by wagering), or null. */
  warmup: WarmupState | null
  /** Free spins available on the wheel. */
  freeSpins: number
  /** Store items redeemed (one-time cosmetics live here). */
  redeemed: string[]
  /** Comp history (operator/agent comps), for reporting. */
  compHistory: CompRecord[]
}

function blankState(): PlayerRewardState {
  return {
    wagered: 0,
    rakebackAccrued: 0,
    lastDailyAt: null,
    streak: 0,
    warmup: null,
    freeSpins: 0,
    redeemed: [],
    compHistory: [],
  }
}

/* --------------------------- seeded demo players --------------------------- */
// Cents throughout. wagered/100 → credits drives the rank (Gold 50k / Diamond 1M …).

const SEED: Record<string, PlayerRewardState> = {
  'p-marco': {
    wagered: 6_840_000, // $68,400 wagered → Gold
    rakebackAccrued: 42_000,
    lastDailyAt: null,
    streak: 0,
    warmup: { locked: 50_000, wagered: 90_000, required: 150_000 },
    freeSpins: 3,
    redeemed: [],
    compHistory: [
      { id: 'c1', by: 'a-e', byName: 'East Desk', kind: 'balance', amount: 1_000, reason: 'Loyalty — rough week', at: 1_749_900_000_000 },
    ],
  },
  'p-lena': {
    wagered: 14_200_000,
    rakebackAccrued: 112_000,
    lastDailyAt: null,
    streak: 0,
    warmup: null,
    freeSpins: 1,
    redeemed: [],
    compHistory: [],
  },
  'p-tariq': {
    wagered: 890_000,
    rakebackAccrued: 9_000,
    lastDailyAt: null,
    streak: 0,
    warmup: { locked: 200_000, wagered: 25_000, required: 600_000 },
    freeSpins: 5,
    redeemed: [],
    compHistory: [
      { id: 'c2', by: 'a-w', byName: 'West Desk', kind: 'balance', amount: 2_000, reason: 'Welcome back bonus', at: 1_749_950_000_000 },
    ],
  },
  'p-priya': {
    wagered: 2_150_000,
    rakebackAccrued: 21_000,
    lastDailyAt: null,
    streak: 0,
    warmup: null,
    freeSpins: 2,
    redeemed: [],
    compHistory: [],
  },
  'p-dana': {
    wagered: 54_000_000, // Diamond
    rakebackAccrued: 340_000,
    lastDailyAt: null,
    streak: 0,
    warmup: { locked: 100_000, wagered: 95_000, required: 300_000 },
    freeSpins: 8,
    redeemed: ['flair-gold'],
    compHistory: [
      { id: 'c3', by: 'mgr', byName: 'Operator', kind: 'balance', amount: 10_000, reason: 'VIP host — Diamond care', at: 1_749_990_000_000 },
      { id: 'c4', by: 'mgr', byName: 'Operator', kind: 'freeplay', amount: 500, reason: 'Crash free plays', at: 1_749_995_000_000 },
    ],
  },
}

/* ------------------------------- the store --------------------------------- */

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<Record<string, PlayerRewardState>> = persistedDoc<Record<string, PlayerRewardState>>(
  store,
  'rewards.players',
  // v3: focused hub state (wagered/rakeback/daily+streak/warmup/spins/store).
  { version: 3, initial: SEED },
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

export function getPlayerRewards(memberId: string): PlayerRewardState {
  return states[memberId] ?? blankState()
}
export function allPlayerRewards(): Record<string, PlayerRewardState> {
  return states
}

function set(memberId: string, next: PlayerRewardState): void {
  states = { ...states, [memberId]: next }
  notify()
}
function mutate(memberId: string, fn: (s: PlayerRewardState) => PlayerRewardState): void {
  set(memberId, fn(getPlayerRewards(memberId)))
}

/** Read a member's live balance (cents) from the book (0 if unknown). */
function balanceOf(memberId: string): number {
  return getBook().members[memberId]?.account.balance ?? 0
}

/* ------------------------------- rakeback + warm-up (from real wagering) ---- */

/**
 * Record one wager's worth of play (pure state): lifetime `wagered` grows, RAKEBACK accrues
 * at the config rate, and the WARM-UP bonus advances. Returns the credits that just UNLOCKED
 * (the caller credits them to the balance via `settleWager`). All cents.
 */
export function recordWager(memberId: string, stakeCents: number, _now: number): { unlockedCents: number } {
  if (stakeCents <= 0) return { unlockedCents: 0 }
  const rate = getRewardsConfig().loyalty.rakebackRate
  let unlocked = 0
  mutate(memberId, (s) => {
    let warmup = s.warmup
    if (warmup) {
      const wagered = warmup.wagered + stakeCents
      if (wagered >= warmup.required) {
        unlocked = warmup.locked
        warmup = null
      } else {
        warmup = { ...warmup, wagered }
      }
    }
    return {
      ...s,
      wagered: s.wagered + stakeCents,
      rakebackAccrued: s.rakebackAccrued + Math.round(stakeCents * rate),
      warmup,
    }
  })
  return { unlockedCents: unlocked }
}

/** Record a wager AND credit any warm-up that just unlocked to the real balance. Used by the
 *  live wager listener and the demo control. */
export function settleWager(memberId: string, stakeCents: number, now: number): { unlockedCents: number } {
  const out = recordWager(memberId, stakeCents, now)
  if (out.unlockedCents > 0) {
    try {
      adjustFigure(memberId, out.unlockedCents, 'Warm-up bonus unlocked', 'rewards')
      recordIssuance('warmup', Math.round(out.unlockedCents / 100), now)
    } catch {
      /* member not in the book (edge/test) — state still updated */
    }
  }
  return out
}

/** Claim accrued rakeback into the real balance. Returns cents credited. */
export function claimRakeback(memberId: string, now: number): number {
  const amt = getPlayerRewards(memberId).rakebackAccrued
  if (amt <= 0) return 0
  adjustFigure(memberId, amt, 'Rakeback claimed', 'rewards')
  recordIssuance('cashback', Math.round(amt / 100), now)
  mutate(memberId, (s) => ({ ...s, rakebackAccrued: 0 }))
  return amt
}

/* ------------------------------- daily bonus + streak ---------------------- */

export interface DailyStatus {
  claimable: boolean
  /** ms until claimable again (0 if claimable). */
  msLeft: number
  /** When the next claim unlocks (null if never claimed). */
  nextAt: number | null
  /** Current streak. */
  streak: number
  /** The amount THIS claim would pay (cents). */
  amountCents: number
}

function streakAfter(s: PlayerRewardState, since: number, cooldown: number): number {
  if (s.lastDailyAt == null) return 1
  if (since < 2 * cooldown) return s.streak + 1 // consecutive day
  return 1 // a day was missed → reset
}

/** The live daily-bonus state, computed off the stored claim timestamp. */
export function dailyStatus(memberId: string, now: number): DailyStatus {
  const cfg = getRewardsConfig().loyalty
  const s = getPlayerRewards(memberId)
  const since = s.lastDailyAt == null ? Infinity : now - s.lastDailyAt
  const claimable = since >= cfg.dailyCooldownMs
  const nextStreak = streakAfter(s, since, cfg.dailyCooldownMs)
  const amountCredits = cfg.dailyBase + Math.min(nextStreak, cfg.dailyMaxStreak) * cfg.dailyStreakStep
  return {
    claimable,
    msLeft: claimable ? 0 : cfg.dailyCooldownMs - since,
    nextAt: s.lastDailyAt == null ? null : s.lastDailyAt + cfg.dailyCooldownMs,
    streak: s.streak,
    amountCents: amountCredits * 100,
  }
}

/** Claim the daily bonus (credits the balance + advances the streak). Returns the outcome;
 *  `ok:false` while still on cooldown. */
export function claimDaily(memberId: string, now: number): { ok: boolean; amountCents: number; streak: number } {
  const cfg = getRewardsConfig().loyalty
  const s = getPlayerRewards(memberId)
  const since = s.lastDailyAt == null ? Infinity : now - s.lastDailyAt
  if (since < cfg.dailyCooldownMs) return { ok: false, amountCents: 0, streak: s.streak }
  const streak = streakAfter(s, since, cfg.dailyCooldownMs)
  const amountCredits = cfg.dailyBase + Math.min(streak, cfg.dailyMaxStreak) * cfg.dailyStreakStep
  const amountCents = amountCredits * 100
  adjustFigure(memberId, amountCents, `Daily bonus (streak ${streak})`, 'rewards')
  recordIssuance('daily', amountCredits, now)
  mutate(memberId, (st) => ({ ...st, lastDailyAt: now, streak }))
  return { ok: true, amountCents, streak }
}

/* ------------------------------- free spins -------------------------------- */

/** Use one free spin. `roll` ∈ [0,1) picks the payout in [spinMin, spinMax]. Decrements the
 *  spin count and pays real credits. `ok:false` when there are no spins left. */
export function playFreeSpin(
  memberId: string,
  now: number,
  roll: number,
): { ok: boolean; payoutCents: number; spinsLeft: number } {
  const cfg = getRewardsConfig().loyalty
  const s = getPlayerRewards(memberId)
  if (s.freeSpins <= 0) return { ok: false, payoutCents: 0, spinsLeft: 0 }
  const clamped = Math.max(0, Math.min(0.999999, roll))
  const payoutCredits = Math.round(cfg.spinMin + clamped * (cfg.spinMax - cfg.spinMin))
  const payoutCents = payoutCredits * 100
  if (payoutCents > 0) {
    adjustFigure(memberId, payoutCents, 'Free spin payout', 'rewards')
    recordIssuance('spins', payoutCredits, now)
  }
  const spinsLeft = s.freeSpins - 1
  mutate(memberId, (st) => ({ ...st, freeSpins: spinsLeft }))
  return { ok: true, payoutCents, spinsLeft }
}

/** Grant free spins (store redemption / operator). */
export function grantFreeSpins(memberId: string, n: number): void {
  if (n <= 0) return
  mutate(memberId, (s) => ({ ...s, freeSpins: s.freeSpins + n }))
}

/* ------------------------------- rewards store ----------------------------- */

/** Redeem a store item: spends credits from the balance (can't overspend) and grants the
 *  item. `ok:false` with a reason if unaffordable or already owned. */
export function redeemStoreItem(memberId: string, itemId: string, _now: number): { ok: boolean; reason?: string } {
  const cfg = getRewardsConfig().loyalty
  const item = cfg.store.find((i) => i.id === itemId)
  if (!item) return { ok: false, reason: 'Unknown item.' }
  const s = getPlayerRewards(memberId)
  if (item.once && s.redeemed.includes(item.id)) return { ok: false, reason: 'Already owned.' }
  if (balanceOf(memberId) < item.cost * 100) return { ok: false, reason: 'Not enough credits.' }

  adjustFigure(memberId, -item.cost * 100, `Store: ${item.name}`, 'rewards')
  mutate(memberId, (st) => {
    const next = { ...st, redeemed: st.redeemed.includes(item.id) ? st.redeemed : [...st.redeemed, item.id] }
    if (item.kind === 'spins') next.freeSpins = st.freeSpins + item.amount
    if (item.kind === 'status') next.wagered = st.wagered + item.amount * 100
    return next
  })
  return { ok: true }
}

/* ------------------------------- profit boost ------------------------------ */

/** The active profit-boost promo, or null (none / promos off). */
export function activeBoost(): ProfitBoost | null {
  const l = getRewardsConfig().loyalty
  if (!l.features.promos) return null
  return l.boosts.find((b) => b.active && b.boostPct > 0) ?? null
}

/**
 * Apply the active profit boost to a winning bet — DraftKings/Stake style: credit an extra
 * `boostPct`% of the profit earned on up to `maxStake` credits of stake. Returns the extra
 * credited (cents). No-op if there's no active boost or the bet didn't profit.
 */
export function applyProfitBoost(memberId: string, stakeCents: number, profitCents: number, now: number): number {
  if (profitCents <= 0 || stakeCents <= 0) return 0
  const boost = activeBoost()
  if (!boost) return 0
  const eligibleStake = Math.min(stakeCents, boost.maxStake * 100) // "up to $X"
  const eligibleProfit = (profitCents * eligibleStake) / stakeCents
  const extra = Math.round(eligibleProfit * (boost.boostPct / 100))
  if (extra <= 0) return 0
  try {
    adjustFigure(memberId, extra, `Profit boost +${boost.boostPct}%`, 'rewards')
    recordIssuance('promo', Math.round(extra / 100), now)
  } catch {
    return 0
  }
  return extra
}

/** Demo helper: simulate a winning bet through the real reward paths — accrues rakeback +
 *  warm-up on the stake, credits the win, and applies any active profit boost. */
export function demoWinningBet(memberId: string, stakeCents: number, mult: number, now: number): { profitCents: number; boostCents: number } {
  const profitCents = Math.max(0, Math.round(stakeCents * (mult - 1)))
  settleWager(memberId, stakeCents, now)
  if (profitCents > 0) {
    try {
      adjustFigure(memberId, profitCents, 'Demo: bet won', 'rewards')
    } catch {
      /* member not in book (edge) */
    }
  }
  const boostCents = applyProfitBoost(memberId, stakeCents, profitCents, now)
  return { profitCents, boostCents }
}

/* ------------------------------- leaderboard ------------------------------- */

/** Players ranked by lifetime credits wagered (cents), descending — the one board. */
export function rankedByWagered(): { id: string; wagered: number }[] {
  return Object.entries(states)
    .map(([id, s]) => ({ id, wagered: s.wagered }))
    .sort((a, b) => b.wagered - a.wagered)
}

/* ------------------------------- comps + reset ----------------------------- */

/** Record a comp handed to a player (audit). The credit itself happens in comp.ts. */
export function recordComp(memberId: string, rec: Omit<CompRecord, 'id' | 'at'>, at: number): void {
  mutate(memberId, (s) => ({
    ...s,
    compHistory: [{ ...rec, id: `comp-${at}-${memberId}`, at }, ...s.compHistory],
  }))
}

export function __resetRewardsPlayers(): void {
  states = SEED
  notify()
}
