/**
 * The Rewards admin section — a focused, simple set of tiles. The manager runs the
 * player-facing rewards from one place: Rewards (features on/off + profit-boost promos +
 * Discord/Telegram announcements), plus Tier Config, the Economy knobs, Manual Comp and
 * Reporting. All tiles are MANAGER-ONLY except 'rewards-comp', whose key matches the
 * agent-grantable permission so a manager can let an agent comp their own players.
 */
import { Sparkles, Crown, Gift, SlidersHorizontal, BarChart3 } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { RewardsControlPanel } from './RewardsControlPanel.js'
import { TierConfigPanel } from './TierConfigPanel.js'
import { CompPanel } from './CompPanel.js'
import { EconomyPanel } from './EconomyPanel.js'
import { ReportingPanel } from './ReportingPanel.js'

export const rewardsAdminManifests: FeatureManifest[] = [
  {
    key: 'rewards-control',
    name: 'Rewards',
    hint: 'Turn features on/off, run profit boosts, announce',
    section: 'rewards',
    icon: Sparkles,
    Panel: RewardsControlPanel,
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
    key: 'rewards-economy',
    name: 'Economy',
    hint: 'Caps, budgets & the reward values players get',
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
