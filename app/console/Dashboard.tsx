import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { membersByRole } from '../../features/org/index.js'
import { getBook, getBookVersion, subscribeBook } from '../book-store.js'
import {
  getExposureByGame,
  getExposureVersion,
  subscribeExposure,
  totalOpenExposure,
} from '../exposure.js'
import {
  analyticsVersion,
  bookActivity,
  engagement,
  getAnalyticsRecords,
  inRange,
  subscribeAnalytics,
} from '../../manager/reporting/index.js'

const DAY = 86_400_000
const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '24h', label: '24h', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'all', label: 'All', days: null },
]
const pct = (n: number): string => `${(n * 100).toFixed(1)}%`

/**
 * The operator home — at-a-glance KPIs over the live stores (CLAUDE.md §2, §4). It is
 * READ-ONLY: turnover/hold/engagement come from the durable reporting feed, live
 * exposure from the in-flight exposure tracker, and the biggest pending positions
 * straight off the org figures. It moves no money and configures nothing.
 */
export function Dashboard() {
  const av = useSyncExternalStore(subscribeAnalytics, analyticsVersion)
  const ev = useSyncExternalStore(subscribeExposure, getExposureVersion)
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const [rangeKey, setRangeKey] = useState('7d')

  const view = useMemo(() => {
    const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1]
    const now = Date.now()
    const from = range.days != null ? now - range.days * DAY : 0
    const records = getAnalyticsRecords()
    const windowed = inRange(records, from, now + 1)
    const activity = bookActivity(windowed)
    const eng = engagement(records, now, range.days ?? 30)

    const org = getBook()
    const players = membersByRole(org, 'player')
    const pending = players
      .map((p) => ({ id: p.id, name: p.name, amount: p.account.pending }))
      .filter((p) => p.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    return {
      activity,
      eng,
      totalPlayers: players.length,
      exposure: totalOpenExposure(),
      exposureByGame: getExposureByGame().slice(0, 5),
      pending,
    }
    // av/ev/bv are the change signals from the three stores.
  }, [rangeKey, av, ev, bv])

  const a = view.activity

  return (
    <div className="con-dash">
      <header className="con-dash-head">
        <div>
          <h1 className="con-h1">Dashboard</h1>
          <p className="con-sub">Your book at a glance — live figures, no waiting.</p>
        </div>
        <div className="con-range" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={r.key === rangeKey}
              className={`con-range-btn ${r.key === rangeKey ? 'is-on' : ''}`}
              onClick={() => setRangeKey(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <section className="con-kpis" aria-label="Key figures">
        <Kpi
          label="Turnover"
          value={formatMoney(a.turnover)}
          hint={`${a.bets} bet${a.bets === 1 ? '' : 's'}`}
        />
        <Kpi
          label="Hold"
          value={pct(a.holdPct)}
          hint={`House net ${formatMoney(a.houseNet)}`}
          tone={a.holdPct < 0 ? 'bad' : 'good'}
        />
        <Kpi
          label="Active players"
          value={String(view.eng.active)}
          hint={`of ${view.totalPlayers} on the book`}
        />
        <Kpi
          label="Live exposure"
          value={formatMoney(view.exposure)}
          hint={view.exposure > 0 ? 'open, ungraded' : 'nothing at risk'}
          tone={view.exposure > 0 ? 'warn' : undefined}
        />
      </section>

      <div className="con-dash-grid">
        <section className="con-card" aria-label="Biggest pending">
          <h2 className="con-h2">Biggest pending bets</h2>
          {view.pending.length === 0 ? (
            <p className="con-empty">No open bets right now.</p>
          ) : (
            <ul className="con-list">
              {view.pending.map((p) => (
                <li key={p.id}>
                  <span className="con-list-name">{p.name}</span>
                  <span className="con-list-num">{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="con-card" aria-label="Open exposure by game">
          <h2 className="con-h2">Open exposure by game</h2>
          {view.exposureByGame.length === 0 ? (
            <p className="con-empty">No exposure on any game.</p>
          ) : (
            <ul className="con-list">
              {view.exposureByGame.map((g) => (
                <li key={g.key}>
                  <span className="con-list-name">{g.name}</span>
                  <span className="con-list-num">{formatMoney(g.open)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'good' | 'bad' | 'warn'
}) {
  return (
    <div className={`con-kpi ${tone ? `is-${tone}` : ''}`}>
      <span className="con-kpi-label">{label}</span>
      <strong className="con-kpi-value">{value}</strong>
      {hint && <span className="con-kpi-hint">{hint}</span>}
    </div>
  )
}
