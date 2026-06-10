/**
 * Analytics — ADAPTS manager/reporting ReportingPage (book health & trends: turnover,
 * hold, per-game, per-player, engagement, CSV export over the durable feed). Already a
 * self-contained body; the adapter just themes it via PanelShell.
 */
import { ReportingPage } from '../../manager/reporting/index.js'
import { PanelShell } from './shared.js'

export function AnalyticsPanel({ onBack }: { onBack: () => void }) {
  return (
    <PanelShell onBack={onBack}>
      <ReportingPage />
    </PanelShell>
  )
}
