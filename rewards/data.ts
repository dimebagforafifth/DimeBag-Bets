/**
 * Rewards data model — the rank/tier ladder + the money formatters the hub uses.
 * CREDITS & STATUS ONLY: rank is driven by lifetime credits wagered; everything is shown
 * the same way the rest of the app shows the figure (operator money display).
 */
import type { LucideIcon } from 'lucide-react'
import { Sprout, Medal, Shield, Crown, Gem, Diamond, Wallet, Gauge, Rocket, BadgeCheck, Ticket, Gift, Sparkles, Trophy } from 'lucide-react'
import { formatMoney } from '../games/shared/money.js'

// ── formatting (credits, shown like the rest of the app) ──────────────────────
/** A whole CREDIT amount, rendered as money via the operator's display. */
export const fmt = (credits: number): string => formatMoney(Math.round(credits) * 100)
/** A raw core-cents figure (live balance / rakeback / payout), rendered as money. */
export const fmtCents = (cents: number): string => formatMoney(Math.round(cents))
/** A plain integer (no money symbol) — counts, spin totals, etc. */
export const num = (n: number): string => Math.round(n).toLocaleString()

// ── rank / tier ladder ────────────────────────────────────────────────────────
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
  /** Credits wagered to reach this tier. */
  minWagered: number
  unlocks: Unlock[]
}

export const TIERS: Tier[] = [
  { id: 'rookie', name: 'Rookie', icon: Sprout, color: '#8b94a3', minWagered: 0, unlocks: [{ icon: Gift, label: 'Daily login bonus' }] },
  {
    id: 'bronze', name: 'Bronze', icon: Medal, color: '#b9824a', minWagered: 1_000,
    unlocks: [{ icon: Wallet, label: '500 balance welcome bonus' }, { icon: BadgeCheck, label: 'Bronze profile badge' }],
  },
  {
    id: 'silver', name: 'Silver', icon: Shield, color: '#c2c8d2', minWagered: 10_000,
    unlocks: [{ icon: Wallet, label: '2,000 balance rank bonus' }, { icon: Rocket, label: '1 free play on Crash' }, { icon: BadgeCheck, label: 'Silver profile badge' }],
  },
  {
    id: 'gold', name: 'Gold', icon: Crown, color: '#d6b14a', minWagered: 50_000,
    unlocks: [{ icon: Wallet, label: '7,500 balance rank bonus' }, { icon: Gauge, label: '+50% max-bet limit boost' }, { icon: BadgeCheck, label: 'Gold profile badge' }],
  },
  {
    id: 'platinum', name: 'Platinum', icon: Gem, color: '#7fc7d9', minWagered: 250_000,
    unlocks: [{ icon: Wallet, label: '25,000 balance rank bonus' }, { icon: Gauge, label: '+100% max-bet limit boost' }, { icon: Ticket, label: 'Monthly contest auto-entry' }],
  },
  {
    id: 'diamond', name: 'Diamond', icon: Diamond, color: '#9ad1ff', minWagered: 1_000_000,
    unlocks: [{ icon: Wallet, label: '100,000 balance rank bonus' }, { icon: Gauge, label: 'Top-tier limits' }, { icon: Sparkles, label: 'Animated Diamond name flair' }, { icon: Trophy, label: 'All-time leaderboard eligibility' }],
  },
]

// ── operator-editable tier ladder (serializable: no icons in the persisted config) ──
export interface TierConfig {
  id: string
  name: string
  /** Credits wagered to reach this tier (rank only ever goes up). */
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

/** The tier for a credits-wagered score, from the operator's ladder. */
export function tierForStatus(tiers: TierConfig[], wageredCredits: number): TierConfig {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold)
  return [...sorted].reverse().find((t) => wageredCredits >= t.threshold) ?? sorted[0]
}

export interface StatusProgress {
  tier: TierConfig
  next: TierConfig | null
  pct: number
  toNext: number
}
/** Progress from the current tier's floor to the next, by credits wagered. */
export function tierProgressFor(tiers: TierConfig[], wageredCredits: number): StatusProgress {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold)
  const tier = tierForStatus(sorted, wageredCredits)
  const idx = sorted.findIndex((t) => t.id === tier.id)
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : null
  if (!next) return { tier, next: null, pct: 1, toNext: 0 }
  const span = next.threshold - tier.threshold
  const into = wageredCredits - tier.threshold
  return { tier, next, pct: Math.max(0, Math.min(1, into / span)), toNext: next.threshold - wageredCredits }
}
