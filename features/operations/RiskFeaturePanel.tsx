/**
 * Risk & Exposure — ADAPTS app/RiskPanel (book hold, per-game hold, biggest
 * winners/losers, live exposure, alert thresholds), ported from the old manager
 * console. Themed by PanelShell; body-only.
 */
import { RiskPanel } from '../../app/RiskPanel.js'
import { PanelShell } from './shared.js'

export function RiskFeaturePanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <RiskPanel />
    </PanelShell>
  )
}
