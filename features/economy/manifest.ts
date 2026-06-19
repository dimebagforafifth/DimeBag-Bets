/**
 * The Economy Mode console tile (Control section) — the manager's switch between the credit
 * (PPH) and balance (wallet) economies.
 *
 * // SEAM (wiring pass): this manifest is NOT spread into console/registry/index.ts by this
 * lane (per the shared brief: lanes don't edit the shared registry). The wiring pass mounts it
 * by adding `import { economyManifests } from '../../features/economy/manifest.js'` and
 * `...economyManifests` to REGISTRY. The tile is manager-only by default (registryForRole gives
 * the manager the whole registry; it's not in AGENT_GRANTABLE, so agents never see it — which
 * matches "agents inherit the mode, can't set it").
 */
import { ArrowLeftRight } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { EconomyModePanel } from './EconomyModePanel.js'

export const economyManifests: FeatureManifest[] = [
  {
    key: 'economy-mode',
    name: 'Economy Mode',
    hint: 'Credit (PPH) vs balance (wallet) — whole book',
    section: 'control',
    icon: ArrowLeftRight,
    Panel: EconomyModePanel,
  },
]

export default economyManifests
