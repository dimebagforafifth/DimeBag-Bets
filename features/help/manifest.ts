import { BookOpen } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { ManualPanel } from './ManualPanel.js'

// SEAM: registry owner imports this array into console/registry/index.ts (do NOT edit that file).
// Key 'operator-manual' is non-colliding with the existing control keys.
export const operatorManualManifests: FeatureManifest[] = [
  {
    key: 'operator-manual',
    name: 'Operator Manual',
    hint: 'How every part of the console works',
    section: 'control',
    icon: BookOpen,
    Panel: ManualPanel,
  },
]

export default operatorManualManifests
