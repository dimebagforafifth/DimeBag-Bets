/**
 * Competitions console tile — the operator's creator surface (author contests, close + pay).
 *
 * // SEAM (wiring pass): the registry owner mounts this. Lane rules forbid a feature editing
 * the shared console registry, so this ships ready-to-mount; the wiring pass adds these two
 * lines to console/registry/index.ts (the same pattern the other feature manifests use — do
 * NOT edit that file from this lane):
 *
 *     import { competitionsManifests } from '../../creator/manifest.js'
 *     // …then, in the REGISTRY array under "// Rewards":
 *     ...competitionsManifests,
 *
 * Manager-only by default (inherits the registry's manager-sees-all gating); to make it
 * agent-grantable add { key: 'competitions', label: 'Competitions' } to AGENT_GRANTABLE in
 * app/agent-permissions.ts.
 */
import { Trophy } from 'lucide-react'
import type { FeatureManifest } from '../console/registry/types.js'
import { CompetitionsConsolePanel } from './ui/CreatorConsolePanel.js'

export const competitionsManifests: FeatureManifest[] = [
  {
    key: 'competitions',
    name: 'Competitions',
    hint: 'Author & run branded contests',
    section: 'rewards',
    icon: Trophy,
    Panel: CompetitionsConsolePanel,
  },
]

export default competitionsManifests
