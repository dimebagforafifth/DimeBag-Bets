import { Network, UserCog, TrendingUp } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { AgentsPanel } from './AgentsPanel.js'
import { AgentAdminPanel } from './AgentAdminPanel.js'
import { AgentPerformancePanel } from './AgentPerformancePanel.js'

// SEAM: registry owner imports this array into console/registry/index.ts (do NOT edit that file).
// Keys 'agents' / 'agent-admin' / 'agent-performance' are non-colliding with the players keys.
export const agentsManifests: FeatureManifest[] = [
  {
    key: 'agents',
    name: 'Agents',
    hint: 'The Manager → Master → Agent → Player tree',
    section: 'players',
    icon: Network,
    Panel: AgentsPanel,
  },
  {
    key: 'agent-admin',
    name: 'Agent Admin',
    hint: 'Allowance, commission split & suspend',
    section: 'players',
    icon: UserCog,
    Panel: AgentAdminPanel,
  },
  {
    key: 'agent-performance',
    name: 'Agent Performance',
    hint: 'Win/loss, roster & commission by agent',
    section: 'players',
    icon: TrendingUp,
    Panel: AgentPerformancePanel,
  },
]

export default agentsManifests
