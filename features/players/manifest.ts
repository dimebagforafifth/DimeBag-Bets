import { Users, UserPlus, Coins, SlidersHorizontal, TrendingUp, MessageSquare } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { PlayerAdminPanel } from './PlayerAdminPanel.js'
import { AddPlayerPanel } from './AddPlayerPanel.js'
import { CashierPanel } from './CashierPanel.js'
import { LimitsPanel } from './LimitsPanel.js'
import { PerformancePanel } from './PerformancePanel.js'
import { MessagingPanel } from './MessagingPanel.js'

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
