import { GamesPanel } from '../../app/GamesPanel.js'
import './catalog.css'

/**
 * Casino Admin — game availability. Hosts GamesPanel (enable/disable each game).
 *
 * Per-game house edge moved OUT of here: the flat-RTP HouseEdgePanel was superseded by the
 * Casino Edge tile (app/casino-edge), which tunes each game within its own per-game edge BAND
 * (bps) rather than a single flat floor. Keeping edge in one place avoids two tiles writing the
 * same edge-store with different clamps. (HouseEdgePanel still exists for the retired
 * ManagerConsole; it is no longer mounted in the live console.)
 */
export function CasinoAdminPanel() {
  return (
    <div className="feat feat-stack">
      <GamesPanel />
    </div>
  )
}
