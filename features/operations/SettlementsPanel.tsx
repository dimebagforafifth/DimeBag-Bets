/**
 * Settlements — ADAPTS app/SettlementHistory (the weekly dollar reconcile: past periods,
 * net, members, collection status, export). It's already a self-contained body, so the
 * adapter just themes it via PanelShell.
 */
import { SettlementHistory } from '../../app/SettlementHistory.js'
import { PanelShell } from './shared.js'

export function SettlementsPanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <SettlementHistory />
    </PanelShell>
  )
}
