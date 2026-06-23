/**
 * Pools & Leagues — console tile manifest.
 *
 * // SEAM (wiring pass): the registry owner mounts this. Lane rules forbid a feature editing the
 * shared console registry, so this ships ready-to-mount; the wiring pass adds these two lines to
 * console/registry/index.ts (the same pattern every other feature manifest uses — do NOT edit
 * that file from this lane):
 *
 *     import { poolsManifests } from '../../../pools/manifest.js'
 *     // …then, in the REGISTRY array under "// Operations":
 *     ...poolsManifests,
 *
 * It lives in Operations (alongside the ledger, settlements, import, competitions) — operating
 * the player-run pools is an operations task, manager-only by the console's staff-only gating.
 */

import { Trophy } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { PoolsConsolePanel } from './ui/PoolsConsolePanel.js'

export const poolsManifests: FeatureManifest[] = [
  {
    key: 'pools-leagues',
    name: 'Pools & Leagues',
    hint: 'Player pools, leagues & squares — policy, caps, rake, lifecycle',
    section: 'operations',
    icon: Trophy,
    Panel: PoolsConsolePanel,
  },
]

export default poolsManifests
