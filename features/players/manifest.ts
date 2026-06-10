import { Users, UserPlus, Ticket, SlidersHorizontal, Gauge, Globe, TrendingUp } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { PlayerAdminPanel } from './PlayerAdminPanel.js'
import { AddPlayerPanel } from './AddPlayerPanel.js'
import { PendingPanel } from './PendingPanel.js'
import { LimitsPanel } from './LimitsPanel.js'
import { AnalysisPanel } from './AnalysisPanel.js'
import { SessionsPanel } from './SessionsPanel.js'
import { PerformancePanel } from './PerformancePanel.js'

/**
 * The Players section — operator tools for accounts, tickets, limits, analytics, and
 * access. Player-centric only: no agent/master/super-agent tier or downline reporting.
 *
 * Keys are globally unique across the registry: the open-ticket queue is keyed
 * `player-pending` (Operations already owns `pending` for book-wide exposure) — an
 * intentional, complementary overlap.
 * // SEAM: at integration, reconcile this per-ticket grading queue with Operations'
 * // exposure view, and feed both from one shared open-bets store (Ticketwriter included).
 */
export const playersManifests: FeatureManifest[] = [
  {
    key: 'players',
    name: 'Player Admin',
    hint: 'Accounts, standing & segments',
    section: 'players',
    icon: Users,
    Panel: PlayerAdminPanel,
  },
  {
    key: 'add-player',
    name: 'Add Player',
    hint: 'Onboard one or a batch',
    section: 'players',
    icon: UserPlus,
    Panel: AddPlayerPanel,
  },
  {
    key: 'player-pending',
    name: 'Pending',
    hint: 'Grade open tickets',
    section: 'players',
    icon: Ticket,
    Panel: PendingPanel,
  },
  {
    key: 'limits',
    name: 'Limits',
    hint: 'Caps by player & sport',
    section: 'players',
    icon: SlidersHorizontal,
    Panel: LimitsPanel,
  },
  {
    key: 'analysis',
    name: 'Analysis',
    hint: 'Closing-line value & sharpness',
    section: 'players',
    icon: Gauge,
    Panel: AnalysisPanel,
  },
  {
    key: 'sessions',
    name: 'Sessions',
    hint: 'Logins, devices & IPs',
    section: 'players',
    icon: Globe,
    Panel: SessionsPanel,
  },
  {
    key: 'performance',
    name: 'Player Performance',
    hint: 'Top & bottom movers',
    section: 'players',
    icon: TrendingUp,
    Panel: PerformancePanel,
  },
]

export default playersManifests
