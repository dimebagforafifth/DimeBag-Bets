/**
 * The Rewards admin section — the operator runs the whole loyalty program from here. All
 * tiles are MANAGER-ONLY except 'rewards-comp' (Manual Comp), whose key matches the
 * agent-grantable permission so a manager can let an agent comp their own players. The
 * registry owner imports this array; do not edit console/registry/index.ts from here.
 */
import { Crown, Megaphone, Trophy, Gift, CalendarCheck, SlidersHorizontal, BarChart3, Rocket } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { TierConfigPanel } from './TierConfigPanel.js'
import { PublishingPanel } from './PublishingPanel.js'
import { PromotionsPanel } from './PromotionsPanel.js'
import { ContestsPanel } from './ContestsPanel.js'
import { CompPanel } from './CompPanel.js'
import { ProgramsPanel } from './ProgramsPanel.js'
import { EconomyPanel } from './EconomyPanel.js'
import { ReportingPanel } from './ReportingPanel.js'

export const rewardsAdminManifests: FeatureManifest[] = [
  {
    key: 'rewards-publishing',
    name: 'Feature Publishing',
    hint: 'Turn features on, schedule & publish (+ Discord/Telegram)',
    section: 'rewards',
    icon: Rocket,
    Panel: PublishingPanel,
  },
  {
    key: 'tier-config',
    name: 'Tier Config',
    hint: 'Define the loyalty ladder & unlocks',
    section: 'rewards',
    icon: Crown,
    Panel: TierConfigPanel,
  },
  {
    key: 'rewards-promos',
    name: 'Promotions',
    hint: 'Build & run balance-bonus campaigns',
    section: 'rewards',
    icon: Megaphone,
    Panel: PromotionsPanel,
  },
  {
    key: 'rewards-contests',
    name: 'Contests',
    hint: 'Prize races & standings',
    section: 'rewards',
    icon: Trophy,
    Panel: ContestsPanel,
  },
  {
    // KEY MATCHES the 'rewards-comp' agent permission — the one rewards tile an agent can
    // be granted (scoped to their downline + a weekly allowance).
    key: 'rewards-comp',
    name: 'Manual Comp',
    hint: 'Hand a player balance / free plays / a badge',
    section: 'rewards',
    icon: Gift,
    Panel: CompPanel,
  },
  {
    key: 'rewards-programs',
    name: 'Daily & Missions',
    hint: 'Tune the daily cycle & missions',
    section: 'rewards',
    icon: CalendarCheck,
    Panel: ProgramsPanel,
  },
  {
    key: 'rewards-economy',
    name: 'Economy',
    hint: 'Caps, budgets & program switches',
    section: 'rewards',
    icon: SlidersHorizontal,
    Panel: EconomyPanel,
  },
  {
    key: 'rewards-reporting',
    name: 'Reporting',
    hint: 'Balance issued by program & comps',
    section: 'rewards',
    icon: BarChart3,
    Panel: ReportingPanel,
  },
]

export default rewardsAdminManifests
