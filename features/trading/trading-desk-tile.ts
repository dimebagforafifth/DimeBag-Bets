/**
 * Console tile descriptor for the Trading Desk (Round 2, Lane B). Exposed as a self-describing
 * manifest from THIS lane's own file — per the shared brief this module does NOT edit the shared
 * console registry.
 *
 * // SEAM (wiring pass): mount `tradingDeskManifest` into the console registry under 'control'
 * (operator trading/risk surface). Until then the panel is built + tested but not shown.
 */

import { SlidersHorizontal } from 'lucide-react'
import type { FeatureManifest } from '../../console/registry/types.js'
import { TradingDeskPanel } from './TradingDeskPanel.js'

export const tradingDeskManifest: FeatureManifest = {
  key: 'trading-desk',
  name: 'Trading Desk',
  hint: 'Margins, overrides, limits, suspensions',
  section: 'control',
  icon: SlidersHorizontal,
  Panel: TradingDeskPanel,
}
