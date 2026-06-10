/**
 * Segments — ADAPTS app/console/SegmentsPanel (New / Casual / VIP / Dormant player
 * segmentation from the reporting feed + VIP), ported from the old manager console.
 */
import { SegmentsPanel } from '../../app/console/SegmentsPanel.js'
import { PanelShell } from '../operations/shared.js'

export function SegmentsFeaturePanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <SegmentsPanel />
    </PanelShell>
  )
}
