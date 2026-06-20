/**
 * The Referral Program console tile (Rewards section) — set the reward + qualifying rule, toggle
 * the program, and view referral activity.
 *
 * // SEAM (wiring pass): this manifest is NOT spread into console/registry/index.ts by this lane
 * (per the shared brief: lanes don't edit the shared registry). The wiring pass mounts it by
 * adding `import { referralManifests } from '../../features/referrals/manifest.js'` and
 * `...referralManifests` to REGISTRY. Config is manager-gated in the panel; off-by-default.
 */
import { Gift } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { ReferralAdminPanel } from './ReferralAdminPanel.js'

export const referralManifests: FeatureManifest[] = [
  {
    key: 'referrals',
    name: 'Referral Program',
    hint: 'Invite rewards — reward, rule, activity',
    section: 'rewards',
    icon: Gift,
    Panel: ReferralAdminPanel,
  },
]

export default referralManifests
