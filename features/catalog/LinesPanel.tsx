import { TradingDesk } from '../../sportsbook/trading/ui/TradingDesk.js'
import './catalog.css'

/**
 * Sportsbook Lines — markets, odds, holds. Adapts the existing Trading Desk (line
 * management overlay: move lines, set vig, suspend markets) as-is; it's already a
 * self-contained body. Renders only the feature body.
 */
export function LinesPanel() {
  return (
    <div className="feat">
      <TradingDesk />
    </div>
  )
}
