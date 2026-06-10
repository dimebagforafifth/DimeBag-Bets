/**
 * Operations section manifests — the array Agent 1's shell imports to build the grid.
 * weekly-figures + pending are NEW panels (assembled from existing read-only stores);
 * live-activity / settlements / transactions ADAPT existing components.
 */
import { Coins, Hourglass, Activity, Scale, ArrowLeftRight } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { WeeklyFiguresPanel } from './WeeklyFiguresPanel.js'
import { PendingPanel } from './PendingPanel.js'
import { LiveActivityPanel } from './LiveActivityPanel.js'
import { SettlementsPanel } from './SettlementsPanel.js'
import { TransactionsPanel } from './TransactionsPanel.js'

export const operationsManifests: FeatureManifest[] = [
  {
    key: 'weekly-figures',
    name: 'Weekly Figures',
    hint: 'Coins won/lost + settle figure',
    section: 'operations',
    icon: Coins,
    Panel: WeeklyFiguresPanel,
  },
  {
    key: 'pending',
    name: 'Pending Bets',
    hint: 'Open tickets awaiting grade',
    section: 'operations',
    icon: Hourglass,
    Panel: PendingPanel,
  },
  {
    key: 'live-activity',
    name: 'Live Activity',
    hint: 'Real-time bet ticker',
    section: 'operations',
    icon: Activity,
    Panel: LiveActivityPanel,
  },
  {
    key: 'settlements',
    name: 'Settlements',
    hint: 'Weekly coin reconcile',
    section: 'operations',
    icon: Scale,
    Panel: SettlementsPanel,
  },
  {
    key: 'transactions',
    name: 'Transactions',
    hint: 'Credit/coin ledger',
    section: 'operations',
    icon: ArrowLeftRight,
    Panel: TransactionsPanel,
  },
]

export default operationsManifests
