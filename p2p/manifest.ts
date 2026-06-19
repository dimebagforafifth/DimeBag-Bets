/**
 * Challenges Desk console tile — the OPERATOR settle/void surface for P2P challenges.
 *
 * // SEAM (wiring pass): the registry owner mounts this. Lane rules forbid a feature editing the
 * shared console registry, so this ships ready-to-mount; the wiring pass adds these two lines to
 * console/registry/index.ts (the same pattern every other feature manifest uses — do NOT edit
 * that file from this lane):
 *
 *     import { challengesDeskManifests } from '../../p2p/manifest.js'
 *     // …then, in the REGISTRY array under "// Operations":
 *     ...challengesDeskManifests,
 *
 * The console is inherently operator-gated (players never reach it), so no extra role check is
 * needed — manager sees it; to grant it to agents add { key: 'challenges-desk', label:
 * 'Challenges Desk' } to AGENT_GRANTABLE in app/agent-permissions.ts.
 */
import { Swords } from 'lucide-react'
import type { FeatureManifest } from '../console/registry/types.js'
import { ChallengesDeskPanel } from './ChallengesDeskPanel.js'

export const challengesDeskManifests: FeatureManifest[] = [
  {
    key: 'challenges-desk',
    name: 'Challenges Desk',
    hint: 'Settle / void accepted P2P challenges',
    section: 'operations',
    icon: Swords,
    Panel: ChallengesDeskPanel,
  },
]

export default challengesDeskManifests
