/**
 * Rewards data model — the loyalty/status layer for players. BALANCE & STATUS ONLY:
 * every reward is playable BALANCE, a status tier, a cosmetic, free plays, a limit
 * (credit) boost, or a contest entry. There is NEVER cash, cash value, real-money
 * redemption, or anything withdrawable.
 *
 * Reward amounts here are whole BALANCE units (integers). The shared core money model
 * is integer cents = 1/100 of a unit; `fmt()` renders a unit amount the same way the
 * rest of the app shows the figure (via the operator's money display), and `fmtCents()`
 * renders a raw core-cents figure. Data is seeded so every view renders populated; the
 * CLV board ties into the real closing-line-value math in sportsbook/trading/value.ts.
 */
import type { LucideIcon } from 'lucide-react'
import {
  Sprout,
  Medal,
  Shield,
  Crown,
  Gem,
  Diamond,
  Wallet,
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
import { formatMoney } from '../games/shared/money.js'

// ── formatting (balance & credit, shown like the rest of the app) ─────────────
/** A whole BALANCE-unit reward amount, rendered as money via the operator's display. */
export const fmt = (units: number): string => formatMoney(Math.round(units) * 100)
/** A raw core-cents figure (the live balance / available credit), rendered as money. */
export const fmtCents = (cents: number): string => formatMoney(Math.round(cents))
/** A plain integer (no money symbol) — for status points, counts, and progress. */
export const num = (n: number): string => Math.round(n).toLocaleString()

// ── ranks / tiers (VIP-style ladder; thresholds in status points) ─────────────
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
  /** Status points to reach this tier. */
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
      { icon: Wallet, label: '500 balance welcome bonus' },
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
      { icon: Wallet, label: '2,000 balance rank bonus' },
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
      { icon: Wallet, label: '7,500 balance rank bonus' },
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
      { icon: Wallet, label: '25,000 balance rank bonus' },
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
      { icon: Wallet, label: '100,000 balance rank bonus' },
      { icon: Gauge, label: 'Top-tier limits' },
      { icon: Sparkles, label: 'Animated Diamond name flair' },
      { icon: Trophy, label: 'All-time leaderboard eligibility' },
    ],
  },
]

export const tierFor = (wagered: number): Tier =>
  [...TIERS].reverse().find((t) => wagered >= t.minWagered) ?? TIERS[0]

// ── operator-editable tier ladder (serializable: no icons in the persisted config) ──
export interface TierConfig {
  id: string
  name: string
  /** Status points to reach this tier (status only ever goes up). */
  threshold: number
  /** Plain-text perks this tier unlocks. */
  perks: string[]
}
/** The default ladder the manager starts from (mapped off the display TIERS). */
export const DEFAULT_TIERS: TierConfig[] = TIERS.map((t) => ({
  id: t.id,
  name: t.name,
  threshold: t.minWagered,
  perks: t.unlocks.map((u) => u.label),
}))
/** Display icon + colour for a tier id (config holds none — looked up for rendering). */
export const TIER_VISUAL: Record<string, { icon: LucideIcon; color: string }> = Object.fromEntries(
  TIERS.map((t) => [t.id, { icon: t.icon, color: t.color }]),
)
const tierVisualFallback = { icon: Sprout, color: '#8b94a3' }
export const tierVisual = (id: string) => TIER_VISUAL[id] ?? tierVisualFallback

/** The tier for a status score, from the operator's ladder. */
export function tierForStatus(tiers: TierConfig[], status: number): TierConfig {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold)
  return [...sorted].reverse().find((t) => status >= t.threshold) ?? sorted[0]
}

export interface StatusProgress {
  tier: TierConfig
  next: TierConfig | null
  pct: number
  toNext: number
}
/** Progress from the current tier's floor to the next, by status points. */
export function tierProgressFor(tiers: TierConfig[], status: number): StatusProgress {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold)
  const tier = tierForStatus(sorted, status)
  const idx = sorted.findIndex((t) => t.id === tier.id)
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : null
  if (!next) return { tier, next: null, pct: 1, toNext: 0 }
  const span = next.threshold - tier.threshold
  const into = status - tier.threshold
  return { tier, next, pct: Math.max(0, Math.min(1, into / span)), toNext: next.threshold - status }
}

export const nextTier = (wagered: number): Tier | null => {
  const i = TIERS.findIndex((t) => t.id === tierFor(wagered).id)
  return i < TIERS.length - 1 ? TIERS[i + 1] : null
}

export interface TierProgress {
  tier: Tier
  next: Tier | null
  /** 0..1 progress from the current tier's floor to the next tier's floor. */
  pct: number
  toNext: number // status points still needed (0 at max tier)
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
  wagered: number // status points (lifetime) — drives the tier ladder
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
  reward: number // balance units
  bonus?: string // a non-balance perk on milestone days
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

// ── challenges / missions ─────────────────────────────────────────────────────
export interface Challenge {
  id: string
  name: string
  desc: string
  icon: LucideIcon
  goal: number
  progress: number
  reward: number // balance units
  rewardExtra?: string // a non-balance perk
  claimed: boolean
}
export const SEED_CHALLENGES: Challenge[] = [
  { id: 'place-5', name: 'Warm Up', desc: 'Place 5 bets today.', icon: Target, goal: 5, progress: 5, reward: 250, claimed: false },
  { id: 'try-3-games', name: 'Sampler', desc: 'Try 3 different casino originals.', icon: Dice5, goal: 3, progress: 2, reward: 400, claimed: false },
  { id: 'parlay-hit', name: 'Parlay Hero', desc: 'Hit a parlay of 3+ legs.', icon: Trophy, goal: 1, progress: 0, reward: 1_000, rewardExtra: 'Parlay badge', claimed: false },
  { id: 'wager-10k', name: 'High Roller', desc: 'Wager 10,000 this week.', icon: TrendingUp, goal: 10_000, progress: 6_800, reward: 1_500, claimed: false },
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
  { id: 'big-win', name: 'Big Hit', desc: 'Win 5,000+ on a single bet.', icon: Trophy, category: 'wins', earned: true, earnedOn: 'May 18' },
  { id: 'whale-win', name: 'Whale', desc: 'Win 25,000+ on a single bet.', icon: Gem, category: 'wins', earned: false },
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
  unit: 'money' | 'count' | 'pct'
}
export const BOARDS: BoardDef[] = [
  { id: 'profit', name: 'Top Profit', hint: 'Most won', icon: TrendingUp, unit: 'money' },
  { id: 'volume', name: 'Top Volume', hint: 'Most wagered', icon: Wallet, unit: 'money' },
  { id: 'streak', name: 'Win Streak', hint: 'Longest current win streak', icon: Flame, unit: 'count' },
  { id: 'clv', name: 'Closing-Line Value', hint: 'Best avg. CLV vs the close', icon: Target, unit: 'pct' },
]

export interface BoardRow {
  rank: number
  name: string
  value: number
  isYou: boolean
  /** balance awarded to this finishing position (top spots only). */
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
    const value =
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
  def.unit === 'money' ? fmt(v) : def.unit === 'pct' ? `+${v.toFixed(1)}%` : `${v}`

export const PERIODS: Period[] = ['daily', 'weekly', 'monthly', 'alltime']
export const PERIOD_LABEL: Record<Period, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  alltime: 'All-time',
}

// ── sub-view registry (the section's own nav) ────────────────────────────────
export type ViewId =
  | 'overview'
  | 'ranks'
  | 'promos'
  | 'contests'
  | 'boards'
  | 'daily'
  | 'challenges'
  | 'badges'
export interface ViewDef {
  id: ViewId
  name: string
  hint: string
  icon: LucideIcon
}

// Engine types the API surfaces to the views (type-only — no runtime cycle).
import type { LockedBonus } from './players.js'
import type { Promo, Contest } from './economy.js'

/** The runtime API the section shell hands to every sub-view. Engine-backed: the live
 *  core BALANCE + available CREDIT plus the player's STATUS (tier points), their cashback
 *  + locked bonuses, the operator's ENABLED promos/contests, and the claim actions.
 *  Balance & status only — never cash. */
export interface RewardsApi {
  playerName: string
  /** Live core BALANCE in cents (read-only display; the betting figure, never cash). */
  balanceCents: number
  /** Available CREDIT to wager in cents (credit limit + figure − pending). */
  availableCents: number
  player: PlayerRewards
  /** Monotonic STATUS points (drives the tier ladder; never spent). */
  status: number
  /** Cashback accrued from wagering, claimable into the balance. */
  cashbackPending: number
  /** Bonus balance still locked behind a play-through. */
  locked: LockedBonus[]
  /** The operator's live tier ladder. */
  tiers: TierConfig[]
  /** Enabled, in-window promotions. */
  promos: Promo[]
  /** Enabled contests (running / scheduled). */
  contests: Contest[]
  isClaimed: (id: string) => boolean
  /** Mark a reward claimed and credit `amount` balance units (0 for perk-only). */
  claim: (id: string, amount: number, label?: string) => void
  /** Claim accrued cashback into the balance. */
  claimCashback: () => void
  /** Claim / opt into a promotion (grants a bonus, free plays, or a boost opt-in). */
  claimPromo: (promo: Promo) => void
  /** Navigate to another sub-view. */
  go: (view: ViewId) => void
}

export const VIEWS: ViewDef[] = [
  { id: 'overview', name: 'Overview', hint: 'Your status, rewards & claims at a glance', icon: Sparkles },
  { id: 'ranks', name: 'Ranks', hint: 'The tier ladder & what each unlocks', icon: Crown },
  { id: 'promos', name: 'Promotions', hint: 'Active offers — claim & opt in', icon: Gift },
  { id: 'contests', name: 'Contests', hint: 'Prize races & live standings', icon: Trophy },
  { id: 'boards', name: 'Leaderboards', hint: 'Compete for prizes & status', icon: TrendingUp },
  { id: 'daily', name: 'Daily', hint: 'Login bonus & streak rewards', icon: CalendarCheck },
  { id: 'challenges', name: 'Challenges', hint: 'Missions that grant rewards', icon: Target },
  { id: 'badges', name: 'Badges', hint: 'Milestones you’ve collected', icon: BadgeCheck },
]
