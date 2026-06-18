/**
 * Analytics — operator analytics suite over buildOperatorAnalytics: hold % by
 * sport, parlay/SGP penetration, figure trend, cohort retention and credits per
 * active member. Read-only; integer cents; no money path.
 */
import { useSyncExternalStore } from 'react'
import { buildOperatorAnalytics, subscribeCrm, crmVersion } from '../../crm/index.js'
import { formatMoney } from '../../games/shared/money.js'
import { PanelShell } from '../operations/shared.js'
import './crm.css'

const pct1 = (n: number): string => `${(n * 100).toFixed(1)}%`
const pct0 = (n: number): string => `${Math.round(n * 100)}%`

/** Build an SVG area + line path for the cumulative-net trend (0..100 viewBox). */
function trendPaths(values: number[]): { area: string; line: string } | null {
  if (values.length < 2) return null
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const span = max - min || 1
  const x = (i: number): number => (i / (values.length - 1)) * 100
  const y = (v: number): number => 100 - ((v - min) / span) * 100
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(' ')
  const area = `${line} L100 100 L0 100 Z`
  return { area, line }
}

export function AnalyticsPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeCrm, crmVersion)
  const a = buildOperatorAnalytics(Date.now())

  const trend = trendPaths(a.figureTrend.map((p) => p.cumulativeNet))
  const maxCohortPeriods = a.cohorts.reduce((m, c) => Math.max(m, c.retention.length), 0)

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <div>
          <h2 className="feat-h1">Analytics</h2>
          <p className="feat-sub">
            Hold by sport, parlay/SGP mix, figure trend & cohort retention — in credits.
            {a.seeded ? ' Demo dataset.' : ' Live feed.'}
          </p>
        </div>
        {a.seeded && <span className="feat-flag">Seed data</span>}
      </header>

      <section className="feat-kpis" aria-label="Analytics overview">
        <div className="feat-kpi">
          <span className="feat-label">Net margin</span>
          <strong>{pct1(a.netMarginPct)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">SGP penetration</span>
          <strong>{pct1(a.parlayMix.sgpPct)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Credits / active member</span>
          <strong>{formatMoney(a.perActiveMember.perMemberCents)}</strong>
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Hold by sport</h3>
        {a.holdBySport.length === 0 ? (
          <p className="feat-empty">No settled sportsbook bets yet.</p>
        ) : (
          <div className="crm-bars">
            {a.holdBySport.map((h) => (
              <div className="crm-bar-row" key={h.sport}>
                <span className="crm-bar-label">{h.sport.toLowerCase()}</span>
                <div className="crm-bar">
                  <div
                    className="crm-bar-fill"
                    style={{ width: `${Math.max(0, Math.min(100, h.holdPct * 100))}%` }}
                  />
                </div>
                <span className="crm-bar-val">
                  {pct1(h.holdPct)} · {formatMoney(h.turnover)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Figure trend</h3>
        {trend ? (
          <svg
            className="crm-spark"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path className="crm-spark-area" d={trend.area} />
            <path className="crm-spark-line" d={trend.line} />
          </svg>
        ) : (
          <p className="feat-empty">Not enough days to plot.</p>
        )}
        <p className="feat-sub">
          Cumulative house net over {a.figureTrend.length} days, ending{' '}
          {formatMoney(a.figureTrend.at(-1)?.cumulativeNet ?? 0)}.
        </p>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Parlay mix</h3>
        <div className="crm-mix">
          <div className="crm-mix-cell">
            <span className="feat-label">Singles</span>
            <strong>{pct0(1 - a.parlayMix.parlayPct)}</strong>
            <span className="crm-muted">{a.parlayMix.singles} bets</span>
          </div>
          <div className="crm-mix-cell">
            <span className="feat-label">Parlays</span>
            <strong>{pct0(a.parlayMix.parlayPct)}</strong>
            <span className="crm-muted">{a.parlayMix.parlays} bets</span>
          </div>
          <div className="crm-mix-cell">
            <span className="feat-label">Same-game</span>
            <strong>{pct0(a.parlayMix.sgpPct)}</strong>
            <span className="crm-muted">{a.parlayMix.sgp} bets</span>
          </div>
          <div className="crm-mix-cell">
            <span className="feat-label">Avg parlay legs</span>
            <strong>{a.parlayMix.avgParlayLegs.toFixed(1)}</strong>
            <span className="crm-muted">{a.parlayMix.totalBets} total</span>
          </div>
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Cohort retention</h3>
        {a.cohorts.length === 0 ? (
          <p className="feat-empty">No cohorts yet.</p>
        ) : (
          <div className="crm-cohort">
            <div className="crm-cohort-row crm-cohort-head">
              <span>Cohort</span>
              <span>Size</span>
              <span className="crm-cohort-cells">
                {Array.from({ length: maxCohortPeriods }, (_, k) => (
                  <span
                    className="crm-cohort-cell crm-cohort-head"
                    key={k}
                    style={{ background: 'transparent' }}
                  >
                    W{k}
                  </span>
                ))}
              </span>
            </div>
            {a.cohorts.map((c) => (
              <div className="crm-cohort-row" key={c.cohortStart}>
                <span>{c.label}</span>
                <span className="feat-num">{c.size}</span>
                <span className="crm-cohort-cells">
                  {c.retention.map((r, k) => (
                    <span className="crm-cohort-cell" key={k} style={{ ['--shade' as string]: r }}>
                      {pct0(r)}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </PanelShell>
  )
}
