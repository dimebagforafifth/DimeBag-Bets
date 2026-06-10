/**
 * Roles & Access — ADAPTS app/console/PermissionsPanel (the head manager grants
 * console capability slices to sub-agents/agents). This is MANAGER permissions only —
 * NOT the agent/super-agent hierarchy (that lives in the org tree, out of scope here).
 * Already body-only; the adapter just themes it.
 */
import { PermissionsPanel } from '../../app/console/PermissionsPanel.js'
import { PanelShell } from './shared.js'

export function AccessPanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <PermissionsPanel />
    </PanelShell>
  )
}
