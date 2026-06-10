/**
 * Ledger feature manifest — the full durable coin ledger panel, filed under
 * operations. Read-only: filter, link, and export the persisted book ledger.
 */
import { ScrollText } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { LedgerPanel } from './LedgerPanel.js'

// SEAM: registry owner imports this array into console/registry/index.ts (do NOT edit that file)
export const ledgerManifests: FeatureManifest[] = [
  {
    key: 'transactions-log',
    name: 'Ledger',
    hint: 'Full coin ledger — filter, link, export',
    section: 'operations',
    icon: ScrollText,
    Panel: LedgerPanel,
  },
]

export default ledgerManifests
