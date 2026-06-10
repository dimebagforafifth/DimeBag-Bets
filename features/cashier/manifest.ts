import { Wallet } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { CashierDeskPanel } from './CashierDeskPanel.js'

// SEAM: registry owner imports this array into console/registry/index.ts (do NOT edit that file)
export const cashierDeskManifests: FeatureManifest[] = [
  {
    key: 'cashier-desk',
    name: 'Cashier Desk',
    hint: 'Grant / Deduct / Set — batch confirm',
    section: 'players',
    icon: Wallet,
    Panel: CashierDeskPanel,
  },
]

export default cashierDeskManifests
