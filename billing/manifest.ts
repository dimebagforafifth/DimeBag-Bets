/**
 * Per-head billing — console tile manifest.
 *
 * // SEAM (wiring pass): the registry owner mounts this. Lane rules forbid a feature editing the
 * shared console registry, so this ships ready-to-mount; the wiring pass adds these two lines to
 * console/registry/index.ts (the same pattern every other feature manifest uses — do NOT edit
 * that file, or app/agent-permissions.ts, from this lane):
 *
 *     import { billingManifests } from '../../billing/manifest.js'
 *     // …then, in the REGISTRY array under "// Operations":
 *     ...billingManifests,
 *
 * It lives in Operations (alongside the ledger, settlements, import, and live activity). Billing
 * is the OPERATOR's real-money software cost — manager-only by the console's staff-only gating,
 * and intentionally NOT in AGENT_GRANTABLE (no agent can be granted it).
 */

import { Receipt } from 'lucide-react'
import type { FeatureManifest } from '../console/registry/types.js'
import { BillingPanel } from './BillingPanel.js'

export const billingManifests: FeatureManifest[] = [
  {
    key: 'billing-invoices',
    name: 'Billing & Invoices',
    hint: 'Per-head software fee — head count, projected bill, invoices, rate config',
    section: 'operations',
    icon: Receipt,
    Panel: BillingPanel,
  },
]

export default billingManifests
