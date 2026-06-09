import { GamesPanel } from '../../app/GamesPanel.js'
import { HouseEdgePanel } from '../../app/HouseEdgePanel.js'
import './catalog.css'

/**
 * Casino Admin — game config & RTP. Adapts the two existing self-contained panels:
 * GamesPanel (enable/disable each game) and HouseEdgePanel (per-game RTP/house edge).
 * Stacked into one workspace body.
 */
export function CasinoAdminPanel() {
  return (
    <div className="feat feat-stack">
      <GamesPanel />
      <HouseEdgePanel />
    </div>
  )
}
