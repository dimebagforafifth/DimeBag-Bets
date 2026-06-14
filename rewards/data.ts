/**
 * Rewards data model — the loyalty/status layer for players. COINS / POINTS / STATUS
 * ONLY: every reward is bonus coins, a status tier, a cosmetic, free plays, a limit
 * boost, or a contest entry. There is NEVER cash, cash value, real-money redemption,
 * or anything withdrawable — and no "$" amounts (coins are whole-number points).
 *
 * Amounts here are whole COINS (integers), shown via `coins()`. (The shared core
 * money model is integer cents = 1/100 of a coin; `coinsFromCents` bridges the two
 * for read-only displays like the player's live balance.) Data is seeded so every
 * view renders populated; the CLV board ties into the real closing-line-value math in
 * sportsbook/trading/value.ts.
 */
import type { LucideIcon } from 'lucide-react'
import {
  Sprout,
  Medal,
  Shield,
  Crown,
  Gem,
  Diamond,
  Coins,
  Gauge,
  Rocket,
  BadgeCheck,
  Flame,
  Target,
  Dice5,
  Trophy,
  Sparkles,
  Gift,
  Ticket,
  Star,
  CalendarCheck,
  TrendingUp,
} from 'lucide-react'

// ── formatting (coins only, never "$") ───────────────────────────────────────
export const coins = (n: number): string => `${Math.round(n).toLocaleString()} coins`
export const coinsShort = (n: number): string => Math.round(n).toLocaleString()
/** Bridge the core cents model → whole coins for read-only displays. */
export const coinsFromCents = (cents: number): number => Math.round(cents / 100)

// ── ranks / tiers (VIP-style ladder; thresholds in coins WAGERED) ─────────────
export type TierId = 'rookie' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface Unlock {
  icon: LucideIcon
  label: string
}
export interface Tier {
  id: TierId
  name: string
  icon: LucideIcon
  color: string
  /** Coins wagered to reach this tier. */
  minWagered: number
  unlocks: Unlock[]
}

export const TIERS: Tier[] = [
  {
    id: 'rookie',
    name: 'Rookie',
    icon: Sprout,
    color: '#8b94a3',
    minWagered: 0,
    unlocks: [{ icon: Gift, label: 'Daily login bonus' }],
  },
  {
    id: 'bronze',
    name: 'Bronze',
    icon: Medal,
    color: '#b9824a',
    minWagered: 1_000,
    unlocks: [
      { icon: Coins, label: '500-coin welcome bonus' },
      { icon: BadgeCheck, label: 'Bronze profile badge' },
    ],
  },
  {
    id: 'silver',
    name: 'Silver',
    icon: Shield,
    color: '#c2c8d2',
    minWagered: 10_000,
    unlocks: [
      { icon: Coins, label: '2,000-coin rank bonus' },
      { icon: Rocket, label: '1 free play on Crash' },
      { icon: BadgeCheck, label: 'Silver profile badge' },
    ],
  },
  {
    id: 'gold',
    name: 'Gold',
    icon: Crown,
    color: '#d6b14a',
    minWagered: 50_000,
    unlocks: [
      { icon: Coins, label: '7,500-coin rank bonus' },
      { icon: Gauge, label: '+50% max-bet limit boost' },
      { icon: Rocket, label: '3 free plays on casino originals' },
      { icon: BadgeCheck, label: 'Gold profile badge' },
    ],
  },
  {
    id: 'platinum',
    name: 'Platinum',
    icon: Gem,
    color: '#7fc7d9',
    minWagered: 250_000,
    unlocks: [
      { icon: Coins, label: '25,000-coin rank bonus' },
      { icon: Gauge, label: '+100% max-bet limit boost' },
      { icon: Ticket, label: 'Monthly contest auto-entry' },
      { icon: BadgeCheck, label: 'Platinum profile badge' },
    ],
  },
  {
    id: 'diamond',
    name: 'Diamond',
    icon: Diamond,
    color: '#9ad1ff',
    minWagered: 1_000_000,
    unlocks: [
      { icon: Coins, label: '100,000-coin rank bonus' },
      { icon: Gauge, label: 'Top-tier limits' },
      { icon: Sparkles, label: 'Animated Diamond name flair' },
      { icon: Trophy, label: 'All-time leaderboard eligibility' },
    ],
  },
]

export const tierFor = (wagered: number): Tier =>
  [...TIERS].reverse().find((t) => wagered >= t.minWagered) ?? TIERS[0]

export const nextTier = (wagered: number): Tier | null => {
  const i = TIERS.findIndex((t) => t.id === tierFor(wagered).id)
  return i < TIERS.length - 1 ? TIERS[i + 1] : null
}

export interface TierProgress {
  tier: Tier
  next: Tier | null
  /** 0..1 progress from the current tier's floor to the next tier's floor. */
  pct: number
  toNext: number // coins wagered still needed (0 at max tier)
}

export const tierProgress = (wagered: number): TierProgress => {
  const tier = tierFor(wagered)
  const next = nextTier(wagered)
  if (!next) return { tier, next: null, pct: 1, toNext: 0 }
  const span = next.minWagered - tier.minWagered
  const into = wagered - tier.minWagered
  return { tier, next, pct: Math.max(0, Math.min(1, into / span)), toNext: next.minWagered - wagered }
}

// ── the player's reward state (seeded; live balance comes from core) ──────────
export interface PlayerRewards {
  wagered: number // coins wagered (lifetime) — drives the tier ladder
  betsPlaced: number
  daysActive: number
  loginStreak: number // consecutive days
  dailyClaimedToday: boolean
}

/** A realistic mid-ladder profile so every view renders populated. */
export const seedPlayer = (): PlayerRewards => ({
  wagered: 68_400,
  betsPlaced: 412,
  daysActive: 23,
  loginStreak: 5,
  dailyClaimedToday: false,
})

// ── daily / streak ────────────────────────────────────────────────────────────
export interface DailyDay {
  day: number // 1..7 in the streak cycle
  reward: number // coins
  bonus?: string // a non-coin perk on milestone days
}
export const DAILY_CYCLE: DailyDay[] = [
  { day: 1, reward: 100 },
  { day: 2, reward: 150 },
  { day: 3, reward: 250 },
  { day: 4, reward: 400 },
  { day: 5, reward: 600, bonus: '1 free play on Mines' },
  { day: 6, reward: 800 },
  { day: 7, reward: 1_500, bonus: 'Streak-keeper badge' },
]

// ── store / catalog (coins to spend, perks to claim — never cash) ─────────────
export type StoreKind = 'bonus' | 'freeplay' | 'limit' | 'flair' | 'contest'
export interface StoreItem {
  id: string
  name: string
  desc: string
  cost: number // coins to spend
  kind: StoreKind
  icon: LucideIcon
}
export const STORE: StoreItem[] = [
  { id: 'bonus-1k', name: '1,000 Coin Pack', desc: 'Instant 1,000 bonus coins to your balance.', cost: 900, kind: 'bonus', icon: Coins },
  { id: 'bonus-5k', name: '5,000 Coin Pack', desc: 'Instant 5,000 bonus coins — best value.', cost: 4_250, kind: 'bonus', icon: Coins },
  { id: 'free-crash', name: 'Crash Free Play', desc: 'One free Crash round at a 250-coin stake.', cost: 200, kind: 'freeplay', icon: Rocket },
  { id: 'free-mines', name: 'Mines Free Play', desc: 'One free Mines board at a 250-coin stake.', cost: 200, kind: 'freeplay', icon: Dice5 },
  { id: 'limit-24h', name: '24h Limit Boost', desc: '+100% max bet for 24 hours.', cost: 1_500, kind: 'limit', icon: Gauge },
  { id: 'flair-gold', name: 'Gold Name Flair', desc: 'A gold glow on your name for 7 days.', cost: 2_000, kind: 'flair', icon: Sparkles },
  { id: 'flair-emoji', name: 'Profile Emoji', desc: 'Pin an emoji badge to your profile.', cost: 500, kind: 'flair', icon: Star },
  { id: 'contest-weekly', name: 'Weekly Contest Entry', desc: 'One entry into this week’s coin contest.', cost: 750, kind: 'contest', icon: Ticket },
]
export const STORE_KIND_LABEL: Record<StoreKind, string> = {
  bonus: 'Coin pack',
  freeplay: 'Free play',
  limit: 'Limit boost',
  flair: 'Profile flair',
  contest: 'Contest',
}

// ── challenges / missions ─────────────────────────────────────────────────────
export interface Challenge {
  id: string
  name: string
  desc: string
  icon: LucideIcon
  goal: number
  progress: number
  reward: number // coins
  rewardExtra?: string // a non-coin perk
  claimed: boolean
}
export const SEED_CHALLENGES: Challenge[] = [
  { id: 'place-5', name: 'Warm Up', desc: 'Place 5 bets today.', icon: Target, goal: 5, progress: 5, reward: 250, claimed: false },
  { id: 'try-3-games', name: 'Sampler', desc: 'Try 3 different casino originals.', icon: Dice5, goal: 3, progress: 2, reward: 400, claimed: false },
  { id: 'parlay-hit', name: 'Parlay Hero', desc: 'Hit a parlay of 3+ legs.', icon: Trophy, goal: 1, progress: 0, reward: 1_000, rewardExtra: 'Parlay badge', claimed: false },
  { id: 'wager-10k', name: 'High Roller', desc: 'Wager 10,000 coins this week.', icon: TrendingUp, goal: 10_000, progress: 6_800, reward: 1_500, claimed: false },
  { id: 'streak-3', name: 'On a Roll', desc: 'Win 3 bets in a row.', icon: Flame, goal: 3, progress: 3, reward: 600, claimed: false },
  { id: 'daily-7', name: 'Faithful', desc: 'Log in 7 days in a row.', icon: CalendarCheck, goal: 7, progress: 5, reward: 1_500, rewardExtra: 'Streak-keeper badge', claimed: false },
]

// ── achievements / badges ─────────────────────────────────────────────────────
export type BadgeCategory = 'wins' | 'streaks' | 'tiers' | 'milestones'
export interface Achievement {
  id: string
  name: string
  desc: string
  icon: LucideIcon
  category: BadgeCategory
  earned: boolean
  earnedOn?: string // display date
}
export const SEED_ACHIEVEMENTS: Achievement[] = [
  { id: 'first-win', name: 'First Blood', desc: 'Win your first bet.', icon: Star, category: 'milestones', earned: true, earnedOn: 'May 2' },
  { id: 'big-win', name: 'Big Hit', desc: 'Win 5,000+ coins on a single bet.', icon: Trophy, category: 'wins', earned: true, earnedOn: 'May 18' },
  { id: 'whale-win', name: 'Whale', desc: 'Win 25,000+ coins on a single bet.', icon: Gem, category: 'wins', earned: false },
  { id: 'streak-5', name: 'Hot Hand', desc: 'Win 5 bets in a row.', icon: Flame, category: 'streaks', earned: true, earnedOn: 'May 21' },
  { id: 'streak-10', name: 'Unstoppable', desc: 'Win 10 bets in a row.', icon: Rocket, category: 'streaks', earned: false },
  { id: 'reach-silver', name: 'Silver Status', desc: 'Reach the Silver tier.', icon: Shield, category: 'tiers', earned: true, earnedOn: 'May 9' },
  { id: 'reach-gold', name: 'Gold Status', desc: 'Reach the Gold tier.', icon: Crown, category: 'tiers', earned: false },
  { id: 'sampler', name: 'Explorer', desc: 'Play all casino originals.', icon: Dice5, category: 'milestones', earned: false },
  { id: 'anniversary-1', name: 'One Year In', desc: 'Be a member for a year.', icon: CalendarCheck, category: 'milestones', earned: false },
]

// ── leaderboards ──────────────────────────────────────────────────────────────
export type BoardId = 'profit' | 'volume' | 'streak' | 'clv'
export type Period = 'daily' | 'weekly' | 'monthly' | 'alltime'
export type Scope = 'global' | 'friends'

export interface BoardDef {
  id: BoardId
  name: string
  hint: string
  icon: LucideIcon
  /** how a row's value should be rendered. */
  unit: 'coins' | 'count' | 'pct'
}
export const BOARDS: BoardDef[] = [
  { id: 'profit', name: 'Top Profit', hint: 'Most coins won', icon: TrendingUp, unit: 'coins' },
  { id: 'volume', name: 'Top Volume', hint: 'Most coins wagered', icon: Coins, unit: 'coins' },
  { id: 'streak', name: 'Win Streak', hint: 'Longest current win streak', icon: Flame, unit: 'count' },
  { id: 'clv', name: 'Closing-Line Value', hint: 'Best avg. CLV vs the close', icon: Target, unit: 'pct' },
]

export interface BoardRow {
  rank: number
  name: string
  value: number
  isYou: boolean
  /** coins awarded to this finishing position (top spots only). */
  prize: number
}

const NAMES = [
  'Marco', 'Bianca', 'Diego', 'Priya', 'Kenji', 'Lena', 'Omar', 'Sofia',
  'Theo', 'Aisha', 'Nikolai', 'Mia', 'Caleb', 'Yuki', 'Ravi',
]
const PRIZES = [10_000, 5_000, 2_500, 1_000, 500] // 1st..5th

/** Deterministic, populated board: 15 rows, the player slotted in at a realistic
 *  rank. Values scale by board + period + scope so each combo reads distinct. */
export function boardRows(board: BoardId, period: Period, scope: Scope, youName = 'You'): BoardRow[] {
  const periodMul: Record<Period, number> = { daily: 0.2, weekly: 1, monthly: 3.4, alltime: 14 }
  const base: Record<BoardId, number> = { profit: 9_200, volume: 41_000, streak: 11, clv: 6.4 }
  const scopeShift = scope === 'friends' ? 0.55 : 1
  const youRank = scope === 'friends' ? 3 : 7 // the player ranks higher among friends

  const rows: BoardRow[] = []
  const pool = scope === 'friends' ? NAMES.slice(0, 9) : NAMES
  for (let i = 0; i < (scope === 'friends' ? 9 : 15); i++) {
    const rank = i + 1
    const decay = 1 - i * 0.055
    let value =
      board === 'streak'
        ? Math.max(1, Math.round(base.streak * decay * (scope === 'friends' ? 0.8 : 1)))
        : board === 'clv'
          ? Math.round(base.clv * decay * 10) / 10
          : Math.round(base[board] * periodMul[period] * decay * scopeShift)
    const isYou = rank === youRank
    rows.push({
      rank,
      name: isYou ? youName : pool[i % pool.length],
      value,
      isYou,
      prize: PRIZES[i] ?? 0,
    })
  }
  return rows
}

export const boardValue = (def: BoardDef, v: number): string =>
  def.unit === 'coins' ? coins(v) : def.unit === 'pct' ? `+${v.toFixed(1)}%` : `${v}`

export const PERIODS: Period[] = ['daily', 'weekly', 'monthly', 'alltime']
export const PERIOD_LABEL: Record<Period, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  alltime: 'All-time',
}

// ── sub-view registry (the section's own nav) ────────────────────────────────
export type ViewId = 'overview' | 'ranks' | 'boards' | 'store' | 'daily' | 'challenges' | 'badges'
export interface ViewDef {
  id: ViewId
  name: string
  hint: string
  icon: LucideIcon
}
/** The runtime API the section shell hands to every sub-view: live (coins-only)
 *  balance, the player's seeded engagement stats, claim/spend actions, and nav. */
export interface RewardsApi {
  playerName: string
  /** Live balance in whole COINS (read-only display; never cash). */
  balanceCoins: number
  player: PlayerRewards
  isClaimed: (id: string) => boolean
  /** Mark a reward claimed and credit `coinsAmount` (0 for perk-only claims). */
  claim: (id: string, coinsAmount: number, label?: string) => void
  /** Spend coins on a store item; returns false if the balance can't cover it. */
  spend: (id: string, cost: number, label?: string) => boolean
  /** Navigate to another sub-view. */
  go: (view: ViewId) => void
  /** A transient confirmation message (e.g. "Claimed 250 coins"). */
  flash: string | null
}

export const VIEWS: ViewDef[] = [
  { id: 'overview', name: 'Overview', hint: 'Your rank, claims & challenges at a glance', icon: Sparkles },
  { id: 'ranks', name: 'Ranks', hint: 'The tier ladder & what each unlocks', icon: Crown },
  { id: 'boards', name: 'Leaderboards', hint: 'Compete for coins & status', icon: Trophy },
  { id: 'store', name: 'Store', hint: 'Spend coins on bonuses, free plays & flair', icon: Gift },
  { id: 'daily', name: 'Daily', hint: 'Login bonus & streak rewards', icon: CalendarCheck },
  { id: 'challenges', name: 'Challenges', hint: 'Missions that grant coins', icon: Target },
  { id: 'badges', name: 'Badges', hint: 'Milestones you’ve collected', icon: BadgeCheck },
]
