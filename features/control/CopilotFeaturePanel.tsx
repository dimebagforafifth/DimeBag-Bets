/**
 * Copilot — ADAPTS manager/copilot CopilotPage (advisory insights over a read-only
 * book snapshot; never acts), ported from the old manager console.
 */
import { CopilotPage } from '../../manager/index.js'
import { PanelShell } from './shared.js'

export function CopilotFeaturePanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <CopilotPage />
    </PanelShell>
  )
}
