import { HandCoins } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { PointsRequestsPanel } from './PointsRequestsPanel.js'

// SEAM: the registry owner spreads this into console/registry/index.ts (do NOT edit that file).
export const pointsRequestsManifests: FeatureManifest[] = [
  {
    key: 'points-requests',
    name: 'Points Requests',
    hint: 'Approve / deny player point requests',
    section: 'players',
    icon: HandCoins,
    Panel: PointsRequestsPanel,
  },
]

export default pointsRequestsManifests
