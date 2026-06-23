/**
 * Player CRM — wagering-native segments, lifecycle & churn over buildCrmProfiles.
 * Read-only: it observes the live stores (falling back to the demo seed when a
 * fresh session is thin) and renders the segment/lifecycle picture. No money path.
 */
import { useSyncExternalStore } from 'react'
import { buildCrmProfiles, subscribeCrm, crmVersion } from './index.js'
import { SEGMENT_LABEL, LIFECYCLE_LABEL } from './index.js'
import type { CrmSegment, LifecycleStage } from './index.js'
import { formatMoney } from '../../games/shared/money.js'
import { PanelShell } from '../operations/shared.js'
import './crm.css'

const SEGMENT_ORDER: CrmSegment[] = [
  'whale',
  'grinder',
  'sports-regular',
  'parlay-lotto',
  'casino-regular',
  'casual',
  'new',
  'dormant',
]
const LIFECYCLE_ORDER: LifecycleStage[] = [
  'onboarding',
  'habit',
  'vip',
  'at-risk',
  'reactivated',
  'dormant',
]

const pct = (n: number): string => `${Math.round(n * 100)}%`

export function CrmSegmentsPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeCrm, crmVersion)
  const { profiles, seeded } = buildCrmProfiles(Date.now())

  const bySegment = new Map<CrmSegment, number>()
  const byLifecycle = new Map<LifecycleStage, number>()
  for (const p of profiles) {
    bySegment.set(p.segment.segment, (bySegment.get(p.segment.segment) ?? 0) + 1)
    byLifecycle.set(p.segment.lifecycle, (byLifecycle.get(p.segment.lifecycle) ?? 0) + 1)
  }
  const rows = [...profiles].sort((a, b) => b.behavior.turnoverCents - a.behavior.turnoverCents)

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <div>
          <h2 className="feat-h1">Player CRM</h2>
          <p className="feat-sub">
            Wagering-native segments, lifecycle stage & churn risk per player.
            {seeded ? ' Demo dataset (live feed still thin).' : ' Live feed.'}
          </p>
        </div>
        {seeded && <span className="feat-flag">Seed data</span>}
      </header>

      <section className="feat-kpis" aria-label="CRM overview">
        <div className="feat-kpi">
          <span className="feat-label">Total players</span>
          <strong>{profiles.length}</strong>
        </div>
        {LIFECYCLE_ORDER.filter((s) => (byLifecycle.get(s) ?? 0) > 0).map((s) => (
          <div className="feat-kpi" key={s}>
            <span className="feat-label">{LIFECYCLE_LABEL[s]}</span>
            <strong>{byLifecycle.get(s) ?? 0}</strong>
          </div>
        ))}
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Segment breakdown</h3>
        <ul className="feat-list">
          {SEGMENT_ORDER.filter((s) => (bySegment.get(s) ?? 0) > 0).map((s) => (
            <li key={s}>
              <span>{SEGMENT_LABEL[s]}</span>
              <span className="feat-num">{bySegment.get(s)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Players</h3>
        <table className="feat-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Segment</th>
              <th>Lifecycle</th>
              <th>Stake</th>
              <th>Top game</th>
              <th className="num">Churn risk</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.player.id}>
                <td>{p.player.name}</td>
                <td>
                  <span className="crm-pill">{SEGMENT_LABEL[p.segment.segment]}</span>
                </td>
                <td>{LIFECYCLE_LABEL[p.segment.lifecycle]}</td>
                <td>
                  {p.behavior.stakeTier} · {formatMoney(p.behavior.medianStakeCents)}
                </td>
                <td>{p.behavior.topGameName || '—'}</td>
                <td className="num">{pct(p.behavior.churnRisk)}</td>
                <td>
                  <span className="crm-chips">
                    {p.segment.tags.slice(0, 4).map((t) => (
                      <span className="crm-chip" key={t}>
                        {t}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PanelShell>
  )
}
