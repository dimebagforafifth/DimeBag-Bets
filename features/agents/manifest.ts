import { Network } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { AgentsPanel } from './AgentsPanel.js'

// SEAM: registry owner imports this array into console/registry/index.ts (do NOT edit that file).
// Key 'agents' is non-colliding with the existing players-section keys.
export const agentsManifests: FeatureManifest[] = [
  {
    key: 'agents',
    name: 'Agents',
    hint: 'Super-agents, agents & players — edit credit & balances',
    section: 'players',
    icon: Network,
    Panel: AgentsPanel,
  },
]

export default agentsManifests
