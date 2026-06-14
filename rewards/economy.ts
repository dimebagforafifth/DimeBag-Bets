/**
 * The operator-controlled rewards CONFIG + the balance ECONOMY — the source of truth the
 * manager edits and players read (CLAUDE.md §4). Persisted on the standard doc seam.
 *
 * BALANCE & STATUS ONLY. Every amount here is balance units, status points, a free-play
 * count, an odds-boost %, or a wagering multiplier — never cash, cash value, or a
 * withdrawal. The economy block caps total issuance so rewards can't inflate the balance
 * supply, and tracks an agent comp allowance so a granted agent can hand out funds only
 * within a budget.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import { DEFAULT_TIERS, type TierConfig } from './data.js'

export type ProgramKey =
  | 'tiers'
  | 'cashback'
  | 'daily'
  | 'missions'
  | 'promos'
  | 'contests'
  | 'leaderboards'

export const PROGRAM_KEYS: ProgramKey[] = [
  'tiers',
  'cashback',
  'daily',
  'missions',
  'promos',
  'contests',
  'leaderboards',
]

export type PromoKind = 'bonus' | 'freeplay' | 'oddsboost' | 'topup'
export interface Promo {
  id: string
  name: string
  desc: string
  kind: PromoKind
  /** bonus/topup → balance units; freeplay → count; oddsboost → percent. */
  amount: number
  /** Wagering multiplier the bonus balance carries before it unlocks to the regular figure
   *  (1 = wager the bonus once). 0 = instant, no lock. NEVER a cash-out condition. */
  playthrough: number
  startsAt: number
  endsAt: number
  active: boolean
}

export type ContestMetric = 'profit' | 'volume' | 'streak' | 'clv'
export interface Contest {
  id: string
  name: string
  metric: ContestMetric
  startsAt: number
  endsAt: number
  /** The balance prize pool, split across places by `prizes`. */
  prizePool: number
  prizes: number[] // balance for 1st, 2nd, …
  status: 'scheduled' | 'running' | 'settled'
}

export interface MissionDef {
  id: string
  name: string
  desc: string
  goal: number
  reward: number
  active: boolean
}

export interface DailyConfig {
  enabled: boolean
  /** Balance for each day of the 7-day streak cycle. */
  rewards: number[]
}

export interface EconomyConfig {
  /** Hard cap on TOTAL balance the program may ever issue (0 = uncapped). */
  totalIssuanceCap: number
  /** Per-week issuance budget (0 = uncapped). */
  weeklyBudget: number
  /** Cashback rate — fraction of the amount WAGERED returned over time (0.005 = 0.5%). */
  cashbackRate: number
  /** Balance each agent may comp per week (their discretionary allowance). */
  agentWeeklyCompAllowance: number
}

/* ----- the focused hub: one config block the manager sets, no magic numbers ----- */
export type StoreItemKind = 'spins' | 'status' | 'cosmetic'
export interface StoreItem {
  id: string
  name: string
  desc: string
  /** Credits to spend (deducted from the player's balance). */
  cost: number
  kind: StoreItemKind
  /** spins → free spins granted; status → status/rank points; cosmetic → 0. */
  amount: number
  /** One-time (cosmetics) vs repeatable (spin packs). */
  once?: boolean
}

/** The features the manager turns on/off (DraftKings/Stake-style). */
export type RewardFeature = 'rakeback' | 'daily' | 'freeSpins' | 'promos'

/** A profit-boost promo — adds `boostPct`% to the profit on a winning bet, on up to
 *  `maxStake` credits of stake ("25% profit boost on all bets up to $100"). */
export interface ProfitBoost {
  id: string
  name: string
  boostPct: number
  /** "up to $X" — the max stake (credits) the boost applies to. */
  maxStake: number
  active: boolean
}

export interface LoyaltyConfig {
  /** Which player-facing features are live (the manager's simple on/off). */
  features: Record<RewardFeature, boolean>
  /** Profit-boost promos the manager runs. */
  boosts: ProfitBoost[]
  /** Fraction of credits WAGERED accrued as rakeback (0.05 = 5%). */
  rakebackRate: number
  /** Base credits per daily claim. */
  dailyBase: number
  /** Extra credits per consecutive-day streak (capped at dailyMaxStreak). */
  dailyStreakStep: number
  /** Streak length at which the daily bonus stops growing. */
  dailyMaxStreak: number
  /** Cooldown before the daily bonus can be claimed again (24h). */
  dailyCooldownMs: number
  /** Locked "warm-up" bonus credits a new player gets (unlock by wagering). */
  warmupGrant: number
  /** Wager multiple to unlock the warm-up bonus (required = grant × X). */
  warmupWagerX: number
  /** Free-spin payout range (credits). */
  spinMin: number
  spinMax: number
  /** The rewards store catalogue. */
  store: StoreItem[]
}

export interface RewardsConfig {
  tiers: TierConfig[]
  promos: Promo[]
  contests: Contest[]
  missions: MissionDef[]
  daily: DailyConfig
  economy: EconomyConfig
  /** The simplified rewards-hub knobs (rakeback, daily, warm-up, spins, store). */
  loyalty: LoyaltyConfig
  /** Which programs are turned on (player-visible). */
  enabled: Record<ProgramKey, boolean>
  /** Optional scheduled go-live time per program (epoch ms; null = not scheduled). A
   *  scheduled program stays OFF to players until its time passes and it's published. */
  schedule: Record<ProgramKey, number | null>
}

/* ------------------------------- seed config ------------------------------- */

// Fixed demo timestamps (no Date.now at module load) so seeds are deterministic; the
// admin restamps when it edits. Window: a promo + a contest live "now" in the demo.
const DAY = 86_400_000
const NOW = 1_750_000_000_000 // ~2025; the demo clock the admin advances from

export const DEFAULT_CONFIG: RewardsConfig = {
  tiers: DEFAULT_TIERS,
  promos: [
    {
      id: 'promo-weekend',
      name: 'Weekend Reload',
      desc: 'Top up this weekend and get a 50% bonus, up to 5,000.',
      kind: 'topup',
      amount: 5_000,
      playthrough: 1,
      startsAt: NOW - DAY,
      endsAt: NOW + 2 * DAY,
      active: true,
    },
    {
      id: 'promo-crash-free',
      name: 'Crash Free-Play Drop',
      desc: 'Claim 3 free plays on Crash — no strings.',
      kind: 'freeplay',
      amount: 3,
      playthrough: 0,
      startsAt: NOW - DAY,
      endsAt: NOW + 5 * DAY,
      active: true,
    },
    {
      id: 'promo-nba-boost',
      name: 'NBA Odds Boost',
      desc: '+25% odds boost on any NBA moneyline this week (winnings as balance only).',
      kind: 'oddsboost',
      amount: 25,
      playthrough: 0,
      startsAt: NOW - 2 * DAY,
      endsAt: NOW + 4 * DAY,
      active: true,
    },
  ],
  contests: [
    {
      id: 'contest-weekly-profit',
      name: 'Weekly Profit Race',
      metric: 'profit',
      startsAt: NOW - 3 * DAY,
      endsAt: NOW + 4 * DAY,
      prizePool: 50_000,
      prizes: [20_000, 12_000, 8_000, 6_000, 4_000],
      status: 'running',
    },
    {
      id: 'contest-volume-sprint',
      name: 'Volume Sprint',
      metric: 'volume',
      startsAt: NOW + 5 * DAY,
      endsAt: NOW + 12 * DAY,
      prizePool: 30_000,
      prizes: [12_000, 8_000, 5_000, 3_000, 2_000],
      status: 'scheduled',
    },
  ],
  missions: [
    { id: 'place-5', name: 'Warm Up', desc: 'Place 5 bets today.', goal: 5, reward: 250, active: true },
    { id: 'try-3-games', name: 'Sampler', desc: 'Try 3 different casino originals.', goal: 3, reward: 400, active: true },
    { id: 'parlay-hit', name: 'Parlay Hero', desc: 'Hit a parlay of 3+ legs.', goal: 1, reward: 1_000, active: true },
    { id: 'wager-10k', name: 'High Roller', desc: 'Wager 10,000 this week.', goal: 10_000, reward: 1_500, active: true },
    { id: 'streak-3', name: 'On a Roll', desc: 'Win 3 bets in a row.', goal: 3, reward: 600, active: true },
  ],
  daily: { enabled: true, rewards: [100, 150, 250, 400, 600, 800, 1_500] },
  loyalty: {
    features: { rakeback: true, daily: true, freeSpins: true, promos: true },
    boosts: [{ id: 'boost-25', name: '25% Profit Boost', boostPct: 25, maxStake: 100, active: true }],
    rakebackRate: 0.05,
    dailyBase: 100,
    dailyStreakStep: 25,
    dailyMaxStreak: 7,
    dailyCooldownMs: 86_400_000,
    warmupGrant: 500,
    warmupWagerX: 3,
    spinMin: 10,
    spinMax: 300,
    store: [
      { id: 'spins-5', name: '5 Free Spins', desc: 'Add 5 spins to your wheel.', cost: 1_000, kind: 'spins', amount: 5 },
      { id: 'spins-15', name: '15 Free Spins', desc: 'Add 15 spins — better value.', cost: 2_600, kind: 'spins', amount: 15 },
      { id: 'rank-boost', name: 'Rank Boost', desc: 'Add 2,500 toward your next rank.', cost: 1_500, kind: 'status', amount: 2_500 },
      { id: 'flair-gold', name: 'Gold Name Flair', desc: 'A gold glow on your name.', cost: 5_000, kind: 'cosmetic', amount: 0, once: true },
    ],
  },
  economy: {
    totalIssuanceCap: 50_000_000,
    weeklyBudget: 2_000_000,
    cashbackRate: 0.005,
    agentWeeklyCompAllowance: 25_000,
  },
  enabled: {
    tiers: true,
    cashback: true,
    daily: true,
    missions: true,
    promos: true,
    contests: true,
    leaderboards: true,
  },
  schedule: {
    tiers: null,
    cashback: null,
    daily: null,
    missions: null,
    promos: null,
    contests: null,
    leaderboards: null,
  },
}

/* ------------------------------- the store --------------------------------- */

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<RewardsConfig> = persistedDoc<RewardsConfig>(store, 'rewards.config', {
  // v2: dropped the 'store' program; balance/credit terminology throughout.
  // v3: added per-program publish schedule (goLiveAt).
  // v4: added the focused `loyalty` block (rakeback/daily/warm-up/spins/store).
  // v5: added loyalty.features (on/off) + loyalty.boosts (profit-boost promos).
  version: 5,
  initial: DEFAULT_CONFIG,
})

let config: RewardsConfig = DOC.load() ?? DEFAULT_CONFIG
let version = 0
const listeners = new Set<() => void>()
function notify(): void {
  DOC.save(config)
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeRewardsConfig(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getRewardsConfigVersion(): number {
  return version
}
export function getRewardsConfig(): RewardsConfig {
  return config
}

/** Patch the config (manager only — callers gate on role). Persists + notifies. */
export function updateRewardsConfig(patch: Partial<RewardsConfig>): void {
  config = { ...config, ...patch }
  notify()
}
/** Turn one program on/off (player-visible). */
export function setProgramEnabled(key: ProgramKey, on: boolean): void {
  config = { ...config, enabled: { ...config.enabled, [key]: on } }
  notify()
}
export function isProgramEnabled(key: ProgramKey): boolean {
  return config.enabled[key]
}
/** Set (or clear, with null) a program's scheduled go-live time. */
export function setProgramSchedule(key: ProgramKey, goLiveAt: number | null): void {
  config = { ...config, schedule: { ...config.schedule, [key]: goLiveAt } }
  notify()
}
export function getProgramSchedule(key: ProgramKey): number | null {
  return config.schedule[key] ?? null
}

/* -------------- player-facing reads (ENABLED programs only) ---------------- */

/** Promos a player may see/claim: enabled, active, and within their window. */
export function visiblePromos(now: number): Promo[] {
  if (!config.enabled.promos) return []
  return config.promos.filter((p) => p.active && now >= p.startsAt && now <= p.endsAt)
}
/** Contests a player may see: enabled and running or scheduled. */
export function visibleContests(): Contest[] {
  if (!config.enabled.contests) return []
  return config.contests.filter((c) => c.status !== 'settled')
}
export function activeMissions(): MissionDef[] {
  return config.enabled.missions ? config.missions.filter((m) => m.active) : []
}

export function resetRewardsConfig(): void {
  config = DEFAULT_CONFIG
  notify()
}

/* ============================ the issuance ledger =========================== */
// Every unit of balance the program hands out — comps, cashback, daily, missions, promos —
// is recorded here, so the economy's running total + caps actually bound issuance. The
// total cap and the weekly budget are enforced through `canIssue`; agent comp usage is
// tracked per week for the per-agent allowance.

const WEEK = 7 * 86_400_000
export const weekStart = (now: number): number => Math.floor(now / WEEK) * WEEK

interface IssuanceLog {
  byProgram: Record<string, number>
  /** Balance issued per week, keyed by weekStart(now). */
  byWeek: Record<number, number>
  /** Agent comp balance used, keyed `${agentId}|${weekStart}`. */
  agentComp: Record<string, number>
}

const ISSUANCE: Doc<IssuanceLog> = persistedDoc<IssuanceLog>(store, 'rewards.issuance', {
  // v2: added byWeek (weekly-budget tracking). Bumping reseeds the baseline.
  version: 2,
  initial: {
    byProgram: { comp: 23_000, cashback: 41_200, daily: 18_500, mission: 9_400, promo: 14_000, contest: 50_000 },
    byWeek: {},
    agentComp: {},
  },
})

let issuance: IssuanceLog = ISSUANCE.load() ?? { byProgram: {}, byWeek: {}, agentComp: {} }
let issuanceVersion = 0
const issuanceListeners = new Set<() => void>()
function issuanceBump(): void {
  ISSUANCE.save(issuance)
  issuanceVersion += 1
  issuanceListeners.forEach((l) => l())
}

export function subscribeIssuance(l: () => void): () => void {
  issuanceListeners.add(l)
  return () => {
    issuanceListeners.delete(l)
  }
}
export function getIssuanceVersion(): number {
  return issuanceVersion
}

/** Record balance issued by a program at `now` (optionally counting an agent's comp). */
export function recordIssuance(
  program: string,
  amount: number,
  now: number,
  agent?: { agentId: string },
): void {
  if (amount <= 0) return
  const byProgram = { ...issuance.byProgram, [program]: (issuance.byProgram[program] ?? 0) + amount }
  const wk = weekStart(now)
  const byWeek = { ...issuance.byWeek, [wk]: (issuance.byWeek[wk] ?? 0) + amount }
  const agentComp = { ...issuance.agentComp }
  if (agent) {
    const key = `${agent.agentId}|${wk}`
    agentComp[key] = (agentComp[key] ?? 0) + amount
  }
  issuance = { byProgram, byWeek, agentComp }
  issuanceBump()
}

export function totalIssued(): number {
  return Object.values(issuance.byProgram).reduce((a, b) => a + b, 0)
}
export function issuedByProgram(): Record<string, number> {
  return issuance.byProgram
}
export function weekIssued(now: number): number {
  return issuance.byWeek[weekStart(now)] ?? 0
}
export function agentCompUsed(agentId: string, now: number): number {
  return issuance.agentComp[`${agentId}|${weekStart(now)}`] ?? 0
}

/** Whether issuing `amount` now stays within the total cap AND the weekly budget. The
 *  single gate every balance-issuing path checks before handing out rewards. */
export function canIssue(amount: number, now: number): { ok: boolean; reason?: string } {
  if (amount <= 0) return { ok: true }
  const cap = config.economy.totalIssuanceCap
  if (cap > 0 && totalIssued() + amount > cap) {
    return { ok: false, reason: 'The program’s total issuance cap has been reached.' }
  }
  const budget = config.economy.weeklyBudget
  if (budget > 0 && weekIssued(now) + amount > budget) {
    return { ok: false, reason: 'This week’s rewards budget is spent.' }
  }
  return { ok: true }
}

export function __resetIssuance(): void {
  issuance = { byProgram: {}, byWeek: {}, agentComp: {} }
  issuanceBump()
}
