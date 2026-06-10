/**
 * Branding — ADAPTS manager/branding BrandingPage (white-label name/logo/accent/domain
 * + money display + timezone; applies live theming), ported from the old manager console.
 */
import { BrandingPage } from '../../manager/index.js'
import { PanelShell } from './shared.js'

export function BrandingFeaturePanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <BrandingPage />
    </PanelShell>
  )
}
