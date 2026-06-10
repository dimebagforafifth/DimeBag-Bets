/**
 * Promotions — ADAPTS manager/promotions PromotionsPage (free-play / point bonuses to
 * a player or a whole downline; credits flow through core.grant), ported from the old
 * manager console.
 */
import { PromotionsPage } from '../../manager/index.js'
import { PanelShell } from '../operations/shared.js'

export function PromotionsFeaturePanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <PromotionsPage />
    </PanelShell>
  )
}
