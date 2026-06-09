import type { ComponentType } from 'react'
import type { IconType } from './icon.js'
import { Users, UserPlus, Coins, SlidersHorizontal, TrendingUp, MessageSquare } from './icon.js'
import { PlayerAdminPanel } from './PlayerAdminPanel.js'
import { AddPlayerPanel } from './AddPlayerPanel.js'
import { CashierPanel } from './CashierPanel.js'
import { LimitsPanel } from './LimitsPanel.js'
import { PerformancePanel } from './PerformancePanel.js'
import { MessagingPanel } from './MessagingPanel.js'

/**
 * Local stand-in for the shared contract at console/registry/types.ts (Agent 1 owns it;
 * not in this worktree yet). Same field shape, so it unifies on merge. `icon` is an
 * IconType (lucide-shaped) — swap to the real `LucideIcon`/`lucide-react` icons when the
 * dep lands. // TODO(api)
 */
export interface FeatureManifest {
  key: string
  name: string
  hint: string
  section: 'operations' | 'players' | 'catalog' | 'control'
  icon: IconType
  Panel: ComponentType<{ onBack: () => void }>
}

/** The Players section tiles (adapted from existing manager features). */
export const playersManifests: FeatureManifest[] = [
  {
    key: 'players',
    name: 'Player Admin',
    hint: 'Look up accounts, standing, and play history',
    section: 'players',
    icon: Users,
    Panel: PlayerAdminPanel,
  },
  {
    key: 'add-player',
    name: 'Add Player',
    hint: 'Onboard a new account',
    section: 'players',
    icon: UserPlus,
    Panel: AddPlayerPanel,
  },
  {
    key: 'cashier',
    name: 'Cashier',
    hint: 'Issue & adjust coin balances',
    section: 'players',
    icon: Coins,
    Panel: CashierPanel,
  },
  {
    key: 'limits',
    name: 'Limits',
    hint: 'Per-player wager caps',
    section: 'players',
    icon: SlidersHorizontal,
    Panel: LimitsPanel,
  },
  {
    key: 'performance',
    name: 'Player Performance',
    hint: 'Top & bottom movers',
    section: 'players',
    icon: TrendingUp,
    Panel: PerformancePanel,
  },
  {
    key: 'messaging',
    name: 'Messaging',
    hint: 'Broadcast & DM players',
    section: 'players',
    icon: MessageSquare,
    Panel: MessagingPanel,
  },
]

export default playersManifests
