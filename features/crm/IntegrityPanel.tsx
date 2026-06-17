/**
 * Integrity — sharp / CLV risk scoring over buildCrmProfiles. A risk leaderboard
 * (how likely a player is beating the book through skill/value-timing), distinct
 * from financial exposure. Read-only; no money path.
 */
import { useSyncExternalStore } from 'react'
import { buildCrmProfiles, subscribeCrm, crmVersion } from '../../crm/index.js'
import type { RiskBand } from '../../crm/index.js'
import { PanelShell } from '../operations/shared.js'
import './crm.css'

const BAND_LABEL: Record<RiskBand, string> = {
  clean: 'Clean',
  watch: 'Watch',
  sharp: 'Sharp',
  flagged: 'Flagged',
}
const BAND_CLASS: Record<RiskBand, string> = {
  clean: 'crm-band-clean',
  watch: 'crm-band-watch',
  sharp: 'crm-band-sharp',
  flagged: 'crm-band-flagged',
}

const signed = (n: number): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`
const pct = (n: number): string => `${Math.round(n * 100)}%`

export function IntegrityPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeCrm, crmVersion)
  const { profiles, seeded } = buildCrmProfiles(Date.now())

  const rows = [...profiles].sort((a, b) => b.risk.score - a.risk.score)
  const sharp = profiles.filter((p) => p.risk.band === 'sharp' || p.risk.band === 'flagged').length
  const flagged = profiles.filter((p) => p.risk.band === 'flagged').length

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <div>
          <h2 className="feat-h1">Integrity</h2>
          <p className="feat-sub">
            Sharpness / CLV risk — who&apos;s beating the de-vigged line through skill or
            value-timing.{seeded ? ' Demo dataset.' : ' Live feed.'}
          </p>
        </div>
        {seeded && <span className="feat-flag">Seed data</span>}
      </header>

      <section className="feat-kpis" aria-label="Integrity overview">
        <div className="feat-kpi">
          <span className="feat-label">Sharp / flagged</span>
          <strong>{sharp}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Flagged</span>
          <strong>{flagged}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Scored players</span>
          <strong>{profiles.length}</strong>
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Risk leaderboard</h3>
        <table className="feat-table">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Score</th>
              <th>Band</th>
              <th className="num">CLV edge</th>
              <th className="num">Win rate</th>
              <th>Top reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const topReason = [...p.risk.reasons].sort((a, b) => b.weight - a.weight)[0]
              return (
                <tr key={p.player.id}>
                  <td>{p.player.name}</td>
                  <td className="num">{p.risk.score}</td>
                  <td>
                    <span className={`crm-pill ${BAND_CLASS[p.risk.band]}`}>
                      {BAND_LABEL[p.risk.band]}
                    </span>
                  </td>
                  <td className={`num ${p.risk.clvEdgePct >= 0 ? 'feat-up' : 'feat-down'}`}>
                    {signed(p.risk.clvEdgePct)}
                  </td>
                  <td className="num">{pct(p.risk.winRate)}</td>
                  <td className="crm-muted">{topReason ? topReason.label : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </PanelShell>
  )
}
