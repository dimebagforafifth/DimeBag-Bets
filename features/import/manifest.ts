/**
 * Operator import — console tile manifest.
 *
 * // SEAM (wiring pass): the registry owner mounts this. Lane rules forbid a feature editing
 * the shared console registry, so this ships ready-to-mount; the wiring pass adds these two
 * lines to console/registry/index.ts (the same pattern every other feature manifest uses —
 * do NOT edit that file from this lane):
 *
 *     import { importManifests } from '../../features/import/manifest.js'
 *     // …then, in the REGISTRY array under "// Operations":
 *     ...importManifests,
 *
 * It lives in Operations (alongside the ledger, settlements, and live activity) — moving a
 * book onto us is an operations task, manager-only by the console's staff-only gating.
 */

import { UploadCloud } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { ImportPanel } from './ImportPanel.js'

export const importManifests: FeatureManifest[] = [
  {
    key: 'operator-import',
    name: 'Player Import',
    hint: 'Move a book onto us — bulk upload & agent tree',
    section: 'operations',
    icon: UploadCloud,
    Panel: ImportPanel,
  },
]

export default importManifests
