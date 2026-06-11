import {
  Users,
  UserPlus,
  Coins,
  SlidersHorizontal,
  TrendingUp,
  MessageSquare,
  Crown,
  Award,
  PieChart,
  StickyNote,
  Megaphone,
} from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { PlayerAdminPanel } from './PlayerAdminPanel.js'
import { AddPlayerPanel } from './AddPlayerPanel.js'
import { CashierPanel } from './CashierPanel.js'
import { LimitsPanel } from './LimitsPanel.js'
import { PerformancePanel } from './PerformancePanel.js'
import { MessagingPanel } from './MessagingPanel.js'
import { VipFeaturePanel } from './VipFeaturePanel.js'
import { LoyaltyFeaturePanel } from './LoyaltyFeaturePanel.js'
import { SegmentsFeaturePanel } from './SegmentsFeaturePanel.js'
import { NotesFeaturePanel } from './NotesFeaturePanel.js'
import { PromotionsFeaturePanel } from './PromotionsFeaturePanel.js'

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
    name: 'Add Customer',
    hint: 'Onboard a player, agent or master agent',
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
  // Ported from the old manager console:
  {
    key: 'vip',
    name: 'VIP Program',
    hint: 'Rank ladder, leaderboard & free play',
    section: 'players',
    icon: Crown,
    Panel: VipFeaturePanel,
  },
  {
    key: 'loyalty',
    name: 'Loyalty',
    hint: 'Tune the rank thresholds & rewards',
    section: 'players',
    icon: Award,
    Panel: LoyaltyFeaturePanel,
  },
  {
    key: 'segments',
    name: 'Segments',
    hint: 'New / casual / VIP / dormant',
    section: 'players',
    icon: PieChart,
    Panel: SegmentsFeaturePanel,
  },
  {
    key: 'notes',
    name: 'Notes & Tags',
    hint: 'Operator CRM per player',
    section: 'players',
    icon: StickyNote,
    Panel: NotesFeaturePanel,
  },
  {
    key: 'promotions',
    name: 'Promotions',
    hint: 'Free-play & point bonuses',
    section: 'players',
    icon: Megaphone,
    Panel: PromotionsFeaturePanel,
  },
]

export default playersManifests
