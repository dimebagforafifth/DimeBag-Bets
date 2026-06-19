/**
 * Console tile descriptor for SGP Rules & Strictness (PART 1). Exposed as a self-describing
 * manifest from THIS lane's own file — per the shared brief this module does NOT edit the shared
 * console registry (the feature manifests under features/).
 *
 * // SEAM (wiring pass): mount `sgpRulesManifest` into the console registry under the 'catalog'
 * section (or wherever sportsbook config lives) so the tile renders. Until then the panel is built
 * + tested but not shown.
 */

import { ShieldAlert } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { SgpRulesPanel } from './SgpRulesPanel.js'

export const sgpRulesManifest: FeatureManifest = {
  key: 'sgp-rules',
  name: 'SGP Rules',
  hint: 'Same-game parlay conflicts & strictness',
  section: 'catalog',
  icon: ShieldAlert,
  Panel: SgpRulesPanel,
}
