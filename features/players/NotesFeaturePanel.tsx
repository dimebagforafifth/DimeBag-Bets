/**
 * Notes & Tags — ADAPTS app/console/NotesPanel (player CRM notes + tags), ported from
 * the old manager console.
 */
import { NotesPanel } from '../../app/console/NotesPanel.js'
import { PanelShell } from '../operations/shared.js'

export function NotesFeaturePanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <NotesPanel />
    </PanelShell>
  )
}
