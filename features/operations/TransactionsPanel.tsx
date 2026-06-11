/**
 * Transactions — ADAPTS app/Ledger (the credit/dollar ledger: every settled bet with
 * stake, multiplier, net, win-rate). Rendered unscoped (whole book) and themed via
 * PanelShell.
 */
import { Ledger } from '../../app/Ledger.js'
import { PanelShell } from './shared.js'

export function TransactionsPanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <Ledger />
    </PanelShell>
  )
}
