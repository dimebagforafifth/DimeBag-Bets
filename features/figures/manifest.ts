/**
 * Weekly Sheet manifest — the operations-section tile for the DEEP per-player
 * by-day dollar win/loss view. The registry owner imports this array; do not edit
 * console/registry/index.ts here.
 */
import { CalendarRange } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { WeeklySheetPanel } from './WeeklySheetPanel.js'

// SEAM: registry owner imports this array into console/registry/index.ts (do NOT edit that file)
export const weeklySheetManifests: FeatureManifest[] = [
  {
    key: 'figures',
    name: 'Weekly Sheet',
    hint: 'By-day dollar win/loss + settle + export',
    section: 'operations',
    icon: CalendarRange,
    Panel: WeeklySheetPanel,
  },
]

export default weeklySheetManifests
