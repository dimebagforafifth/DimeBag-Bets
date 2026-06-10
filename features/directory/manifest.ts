import { Contact } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { MembersPanel } from './MembersPanel.js'

// SEAM: registry owner imports this array into console/registry/index.ts (do NOT edit that file).
// Key 'members' is non-colliding with the existing players-section keys.
export const membersManifests: FeatureManifest[] = [
  {
    key: 'members',
    name: 'Members',
    hint: 'Everyone on the book — names, roles & profiles',
    section: 'players',
    icon: Contact,
    Panel: MembersPanel,
  },
]

export default membersManifests
