/**
 * Loyalty — ADAPTS manager/loyalty LoyaltyPage (the rank-ladder / progression config
 * over the VIP program), ported from the old manager console.
 */
import { LoyaltyPage } from '../../manager/index.js'
import { PanelShell } from '../operations/shared.js'

export function LoyaltyFeaturePanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <LoyaltyPage />
    </PanelShell>
  )
}
