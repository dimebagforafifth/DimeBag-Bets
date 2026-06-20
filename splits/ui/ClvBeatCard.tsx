/**
 * ClvBeatCard — a profile credibility card: "does this bettor beat the line?" Two honest,
 * separately-labelled signals (see clv.ts): the true closing-line-value beat (gated to n/a
 * until closing-line snapshots exist) and the value over the de-vigged price taken (real
 * today, gated on priced legs). Read-only.
 *
 * // SEAM (profile): the records/profile Profile section mounts this by passing the account id
 * (and `now`). It's self-contained over the records + bets stores so the profile can drop it in.
 */

import { useSyncExternalStore } from 'react'
import { getRecordsVersion, isDemoProfile, subscribeRecords } from '../../records/index.js'
import { clvBeatFor } from '../clv-source.js'
import './splits.css'

const pct1 = (n: number): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`

export function ClvBeatCard({ accountId, now = Date.now() }: { accountId: string; now?: number }) {
  useSyncExternalStore(subscribeRecords, getRecordsVersion)
  const { closing, valueVsTaken } = clvBeatFor(accountId, now)
  // Match the Profile section's honesty: flag when the figures include seeded demo data, so a
  // "Credibility" card is never mistaken for real captured performance.
  const demo = isDemoProfile(accountId)
  return (
    <div className="sp-clv">
      <div className="sp-clv-head">
        <span className="sp-clv-title">Beats the line</span>
        <span className="sp-clv-tag">{demo ? 'Demo data' : 'Credibility'}</span>
      </div>

      <div className="sp-clv-grid">
        <div className="sp-clv-cell">
          <span className="sp-clv-label">Beats the close (CLV)</span>
          {closing.available ? (
            <>
              <span className={`sp-clv-value ${closing.beatRate >= 50 ? 'is-up' : 'is-down'}`}>
                {closing.beatRate.toFixed(0)}%
              </span>
              <span className="sp-clv-sub">
                {pct1(closing.avgClvPct)} avg · {closing.sampleSize} priced bets
              </span>
            </>
          ) : (
            <>
              <span className="sp-clv-value is-even">n/a</span>
              <span className="sp-clv-sub">{closing.note}</span>
            </>
          )}
        </div>

        <div className="sp-clv-cell">
          <span className="sp-clv-label">Value vs price taken</span>
          {valueVsTaken.available ? (
            <>
              <span className={`sp-clv-value ${valueVsTaken.beatRate >= 50 ? 'is-up' : 'is-down'}`}>
                {valueVsTaken.beatRate.toFixed(0)}%
              </span>
              <span className="sp-clv-sub">
                {pct1(valueVsTaken.avgEdgePct)} avg edge · {valueVsTaken.sampleSize} priced legs
              </span>
            </>
          ) : (
            <>
              <span className="sp-clv-value is-even">n/a</span>
              <span className="sp-clv-sub">{valueVsTaken.note}</span>
            </>
          )}
        </div>
      </div>
      <p className="sp-clv-foot">
        Closing-line value needs a settlement-time closing price (gated until captured); value vs
        price taken is measured against the de-vigged line the bet was struck at.
      </p>
    </div>
  )
}
