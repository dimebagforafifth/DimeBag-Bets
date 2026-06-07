import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../../games/shared/money.js'
import { getBook, getBookVersion, subscribeBook } from '../../../app/book-store.js'
import { analyticsVersion, getAnalyticsRecords, subscribeAnalytics } from '../../reporting/capture.js'
import { buildSnapshot } from '../snapshot.js'
import { analyze, type Area, type Priority } from '../insights.js'
import './copilot.css'

const WINDOWS: { label: string; days: number }[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
]
const PRIORITY_LABEL: Record<Priority, string> = { high: 'Priority', medium: 'Worth doing', low: 'FYI' }
const AREA_LABEL: Record<Area, string> = {
  risk: 'Risk',
  promotions: 'Promotions',
  reporting: 'Reporting',
  communication: 'Communication',
  general: 'General',
}
const pct = (n: number): string => `${(n * 100).toFixed(1)}%`

/**
 * AI Manager Copilot (advisory). Reads a read-only snapshot of the book and offers
 * ranked, explained recommendations. It NEVER acts — the manager performs any
 * suggested step on the relevant page. Self-contained; the shell mounts it.
 */
export function CopilotPage() {
  const av = useSyncExternalStore(subscribeAnalytics, analyticsVersion)
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const [days, setDays] = useState(7)

  const snapshot = useMemo(
    () => buildSnapshot(getAnalyticsRecords(), getBook(), Date.now(), days),
    [av, bv, days],
  )
  const recs = useMemo(() => analyze(snapshot), [snapshot])
  const s = snapshot

  return (
    <div className="mgr-cop">
      <header className="mgr-cop-head">
        <div>
          <h1 className="mgr-cop-title">
            Manager Copilot <span className="mgr-cop-tag">Premium</span>
          </h1>
          <p className="mgr-cop-sub">Reads your book and suggests moves — advisory only. You approve every action.</p>
        </div>
        <div className="mgr-cop-range">
          {WINDOWS.map((w) => (
            <button key={w.days} className={w.days === days ? 'is-on' : ''} onClick={() => setDays(w.days)}>
              {w.label}
            </button>
          ))}
        </div>
      </header>

      <section className="mgr-cop-snap" aria-label="Snapshot">
        <Fig label="Turnover" value={formatMoney(s.activity.turnover)} />
        <Fig label="Hold" value={pct(s.activity.holdPct)} />
        <Fig label="House net" value={formatMoney(s.activity.houseNet)} tone={s.activity.houseNet >= 0 ? 'up' : 'down'} />
        <Fig label="Active" value={String(s.engagement.active)} />
        <Fig label="Book figure" value={formatMoney(s.bookFigure)} />
        <Fig label="Exposure" value={`${(s.creditUtilization * 100).toFixed(0)}%`} tone={s.creditUtilization >= 0.8 ? 'down' : undefined} />
      </section>

      <section aria-label="Recommendations" className="mgr-cop-recs">
        <h2 className="mgr-h2">
          Recommendations <span className="mgr-cop-count">{recs.length}</span>
        </h2>
        {recs.map((r) => (
          <article key={r.id} className={`mgr-rec is-${r.priority}`}>
            <div className="mgr-rec-top">
              <span className={`mgr-rec-pri is-${r.priority}`}>{PRIORITY_LABEL[r.priority]}</span>
              <span className="mgr-rec-area">{AREA_LABEL[r.area]}</span>
            </div>
            <h3 className="mgr-rec-title">{r.title}</h3>
            <p className="mgr-rec-detail">{r.detail}</p>
            <p className="mgr-rec-action">
              <span className="mgr-rec-action-label">Suggested</span> {r.suggestedAction}
            </p>
          </article>
        ))}
      </section>

      <p className="mgr-cop-foot">
        The Copilot is advisory: it reads your book and explains what it sees, but performs no actions. Apply any
        suggestion yourself on the relevant page.
      </p>
    </div>
  )
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className={`mgr-fig ${tone ? `is-${tone}` : ''}`}>
      <span className="mgr-fig-value">{value}</span>
      <span className="mgr-fig-label">{label}</span>
    </div>
  )
}
