/**
 * Console tile descriptor for Casino Edge (PART 2). Self-describing manifest from THIS lane's own
 * file — per the shared brief this module does NOT edit the shared console registry.
 *
 * // SEAM (wiring pass): mount `casinoEdgeManifest` into the console registry (the 'catalog'
 * section, alongside the existing Casino Admin tile — this one supersedes its flat-RTP control
 * with the per-game bands). Until then the panel is built + tested but not shown.
 */

import { Percent } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { CasinoEdgePanel } from './CasinoEdgePanel.js'

export const casinoEdgeManifest: FeatureManifest = {
  key: 'casino-edge',
  name: 'Casino Edge',
  hint: 'Per-game house-edge bands',
  section: 'catalog',
  icon: Percent,
  Panel: CasinoEdgePanel,
}
