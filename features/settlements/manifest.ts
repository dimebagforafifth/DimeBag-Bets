/**
 * Settlement Run manifest — the operations-section tile for the weekly close
 * (schedule + preview up/down + lock + settle + archive). Owns the 'settlements-run'
 * key (the 'settlements'/'settle' keys are claimed by the operations lane's history
 * adapter + the bare settle action).
 */
import { Gavel } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { SettlementRunPanel } from './SettlementRunPanel.js'

// SEAM: registry owner imports this array into console/registry/index.ts (do NOT edit that file)
export const settlementRunManifests: FeatureManifest[] = [
  {
    key: 'settlements-run',
    name: 'Settlement Run',
    hint: 'Preview up/down, lock, settle, archive',
    section: 'operations',
    icon: Gavel,
    Panel: SettlementRunPanel,
  },
]

export default settlementRunManifests
