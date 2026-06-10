/**
 * Operator Alerts — ADAPTS app/console/AlertsPanel (exposure over cap, credit near
 * the line, big wins, large open positions), ported from the old manager console.
 */
import { AlertsPanel } from '../../app/console/AlertsPanel.js'
import { PanelShell } from './shared.js'

export function AlertsFeaturePanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <AlertsPanel />
    </PanelShell>
  )
}
