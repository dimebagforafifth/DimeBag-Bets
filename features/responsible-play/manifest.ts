/**
 * The Responsible Play console tile (Players section) — a manager/operator READ-ONLY view of
 * player self-limits and cool-offs.
 *
 * // SEAM (wiring pass): this manifest is NOT spread into console/registry/index.ts by this lane
 * (per the shared brief: lanes don't edit the shared registry). The wiring pass mounts it by
 * adding `import { responsiblePlayManifests } from '../../features/responsible-play/manifest.js'`
 * and `...responsiblePlayManifests` to REGISTRY. Read-only, so it carries no money or mutation
 * risk; safe for the manager by default (not in AGENT_GRANTABLE unless an operator opts in).
 */
import { ShieldCheck } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { ResponsiblePlayConsole } from './ResponsiblePlayConsole.js'

export const responsiblePlayManifests: FeatureManifest[] = [
  {
    key: 'responsible-play',
    name: 'Responsible Play',
    hint: 'Player self-limits & cool-offs (read-only)',
    section: 'players',
    icon: ShieldCheck,
    Panel: ResponsiblePlayConsole,
  },
]

export default responsiblePlayManifests
