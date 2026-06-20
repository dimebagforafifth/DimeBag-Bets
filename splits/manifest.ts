/**
 * Betting Splits — console tile manifest. A read-only operator oversight of public bets % vs
 * handle % by market. Plugs into the console registry's FeatureManifest seam.
 */

import { PieChart } from 'lucide-react'
import type { FeatureManifest } from '../console/registry/types.js'
import { SplitsConsolePanel } from './ui/SplitsConsolePanel.js'

// SEAM: registry owner imports splitsManifests into console/registry/index.ts (do NOT edit that file)
export const splitsManifests: FeatureManifest[] = [
  {
    key: 'betting-splits',
    name: 'Betting Splits',
    hint: 'Public bets % vs handle % by market',
    section: 'players',
    icon: PieChart,
    Panel: SplitsConsolePanel,
  },
]

export default splitsManifests
