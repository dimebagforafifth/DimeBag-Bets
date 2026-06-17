/**
 * Abuse Watch — multi-account & collusion clusters over buildAbuseClusters. Links
 * accounts by shared integrity signals (device / network / referral) and the
 * no-cash motives the white paper calls out. Read-only; no money path.
 */
import { useSyncExternalStore } from 'react'
import { buildAbuseClusters, getCrmDataset, subscribeCrm, crmVersion } from '../../crm/index.js'
import type { AbuseKind, ClusterKind } from '../../crm/index.js'
import { PanelShell } from '../operations/shared.js'
import './crm.css'

const CLUSTER_LABEL: Record<ClusterKind, string> = {
  'shared-device': 'Shared device',
  'shared-ip': 'Shared network',
  'collusion-ring': 'Collusion ring',
  'referral-ring': 'Referral ring',
}
const FLAG_LABEL: Record<AbuseKind, string> = {
  'multi-account': 'Multi-account',
  collusion: 'Collusion',
  'rakeback-abuse': 'Rakeback abuse',
  'leaderboard-gaming': 'Leaderboard gaming',
}
const FLAG_ORDER: AbuseKind[] = [
  'multi-account',
  'collusion',
  'rakeback-abuse',
  'leaderboard-gaming',
]

export function AbuseWatchPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeCrm, crmVersion)
  const now = Date.now()
  const { clusters, flags } = buildAbuseClusters(now)
  const nameOf = new Map(getCrmDataset(now).members.map((m) => [m.id, m.name]))
  const names = (ids: string[]): string => ids.map((id) => nameOf.get(id) ?? id).join(', ')

  const flagCounts = new Map<AbuseKind, number>()
  for (const f of flags) flagCounts.set(f.kind, (flagCounts.get(f.kind) ?? 0) + 1)

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <div>
          <h2 className="feat-h1">Abuse Watch</h2>
          <p className="feat-sub">
            Linked-account clusters & abuse flags — device, network, collusion and referral rings.
            No cash; these are integrity signals only.
          </p>
        </div>
      </header>

      <section className="feat-kpis" aria-label="Abuse overview">
        <div className="feat-kpi">
          <span className="feat-label">Clusters</span>
          <strong>{clusters.length}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Flags raised</span>
          <strong>{flags.length}</strong>
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Flags by kind</h3>
        {flags.length === 0 ? (
          <p className="feat-empty">No abuse flags raised.</p>
        ) : (
          <ul className="feat-list">
            {FLAG_ORDER.filter((k) => (flagCounts.get(k) ?? 0) > 0).map((k) => (
              <li key={k}>
                <span>{FLAG_LABEL[k]}</span>
                <span className="feat-num">{flagCounts.get(k)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Linked-account clusters</h3>
        {clusters.length === 0 ? (
          <p className="feat-empty">No linked-account clusters detected.</p>
        ) : (
          <div className="crm-clusters">
            {clusters.map((c) => (
              <div className="crm-cluster" key={c.id}>
                <div className="crm-cluster-head">
                  <span className="crm-cluster-kind">{CLUSTER_LABEL[c.kind]}</span>
                  <span className={`crm-pill crm-sev-${c.severity}`}>{c.severity}</span>
                  <span className="crm-muted">{c.playerIds.length} accounts</span>
                </div>
                <p className="crm-cluster-ev">{c.evidence}</p>
                <span className="crm-chips">
                  {c.playerIds.map((id) => (
                    <span className="crm-chip" key={id}>
                      {nameOf.get(id) ?? id}
                    </span>
                  ))}
                </span>
                {c.sharedKeys.length > 0 && (
                  <p className="crm-cluster-ev">Shared: {names(c.sharedKeys)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </PanelShell>
  )
}
