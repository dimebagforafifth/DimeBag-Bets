/**
 * Collections manifest — the operations-section tile for the agent-by-agent collect /
 * pay worklist. The registry owner imports this array; do not edit
 * console/registry/index.ts from here.
 */
import { HandCoins } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { CollectionsPanel } from './CollectionsPanel.js'

export const collectionsManifests: FeatureManifest[] = [
  {
    key: 'collections',
    name: 'Collections',
    hint: 'Per-agent collect / pay + commission',
    section: 'operations',
    icon: HandCoins,
    Panel: CollectionsPanel,
  },
]

export default collectionsManifests
