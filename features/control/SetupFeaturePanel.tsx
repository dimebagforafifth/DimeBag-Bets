/**
 * Setup — ADAPTS app/console/SetupWizard (the new-manager wizard + conservative /
 * balanced / aggressive presets that drop a coherent house + risk config), ported from
 * the old manager console.
 */
import { SetupWizard } from '../../app/console/SetupWizard.js'
import { PanelShell } from './shared.js'

export function SetupFeaturePanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <SetupWizard />
    </PanelShell>
  )
}
