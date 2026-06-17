/**
 * Pricing-section manifest — the operator's margin / hold-posture console tile.
 *
 * // SEAM (wiring pass): the registry owner mounts this. Lane rules forbid a feature
 * editing the shared console registry, so this ships ready-to-mount; the wiring pass adds
 * these two lines to console/registry/index.ts (the same pattern the other feature
 * manifests use — do NOT edit that file from this lane):
 *
 *     import { pricingManifests } from '../../features/pricing/manifest.js'
 *     // …then, in the REGISTRY array under "// Control":
 *     ...pricingManifests,
 *
 * Manager-only by default (it inherits the registry's manager-sees-all gating); to make it
 * agent-grantable, add { key: 'margin-pricing', label: 'Margin & Pricing' } to
 * AGENT_GRANTABLE in app/agent-permissions.ts.
 */
import { Percent } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { MarginPanel } from './MarginPanel.js'

export const pricingManifests: FeatureManifest[] = [
  {
    key: 'margin-pricing',
    name: 'Margin & Pricing',
    hint: 'Hold posture & per-market juice',
    section: 'control',
    icon: Percent,
    Panel: MarginPanel,
  },
]

export default pricingManifests
