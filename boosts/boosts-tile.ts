/**
 * The Boosts operator tile — rides the rewards admin section (no console-registry edit). The
 * wiring spreads `boostsManifest` into `rewardsAdminManifests` (features/rewards/manifest.ts),
 * alongside the Bonus Engine, since a boost IS a bonus-engine offer.
 */

import { Zap } from 'lucide-react'
import type { FeatureManifest } from '../console/registry/types.js'
import { BoostsPanel } from './ui/BoostsPanel.js'

export const boostsManifest: FeatureManifest = {
  key: 'boosts',
  name: 'Boosts',
  hint: 'Profit & odds boosts via the bonus engine',
  section: 'rewards',
  icon: Zap,
  Panel: BoostsPanel,
}
