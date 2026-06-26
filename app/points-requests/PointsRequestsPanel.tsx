/**
 * Points Requests — the operator side of the closed-loop "Get points" flow. A player
 * files a request from their wallet; here an operator approves it (which credits the
 * player's figure through core via adjustFigure, with an audit trail) or denies it.
 * Read-only on money except the one sanctioned grant path; the request record is then
 * marked decided so it leaves the pending queue.
 */
import { useState, useSyncExternalStore } from 'react'
import { adjustFigure } from '../manager-actions.js'
import { formatMoney } from '../../games/shared/money.js'
import { PanelShell, Figure } from '../../features/_desk/shared.js'
import { pointsRequestsStore, type PointsRequest } from './store.js'

export function PointsRequestsPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(
    pointsRequestsStore.subscribe,
    pointsRequestsStore.version,
    pointsRequestsStore.version,
  )
  const [error, setError] = useState<string | null>(null)

  const pending = pointsRequestsStore.pending()
  const decided = pointsRequestsStore.list().filter((r) => r.status !== 'pending').slice(0, 12)

  function approve(r: PointsRequest) {
    setError(null)
    try {
      // The one sanctioned credit path: move the figure through core + audit, THEN mark the
      // record approved so a failed grant never flips the request to approved.
      adjustFigure(r.playerId, r.amount, `Points request approved — ${r.note || 'no note'}`, 'operator')
      pointsRequestsStore.decide(r.id, 'approved', 'operator', r.amount)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function deny(r: PointsRequest) {
    setError(null)
    pointsRequestsStore.decide(r.id, 'denied', 'operator')
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Points Requests — approve a player's request to credit their figure (through core,
          audited), or deny it.
        </p>
      </header>

      {error && (
        <p className="feat-flag" role="alert">
          {error}
        </p>
      )}

      <div className="feat-card">
        <h3 className="feat-head">Pending ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="feat-empty">No points requests waiting. Players file these from their wallet.</p>
        ) : (
          <table className="feat-table">
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">Amount</th>
                <th>Note</th>
                <th>When</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td>{r.playerName}</td>
                  <td className="num">{formatMoney(r.amount)}</td>
                  <td className="mdsk-meta">{r.note || '—'}</td>
                  <td>{new Date(r.time).toLocaleString()}</td>
                  <td>
                    <div className="feat-actions">
                      <button type="button" className="feat-btn-primary" onClick={() => approve(r)}>
                        Approve
                      </button>
                      <button type="button" className="feat-btn" onClick={() => deny(r)}>
                        Deny
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {decided.length > 0 && (
        <div className="feat-card">
          <h3 className="feat-head">Recent decisions</h3>
          <table className="feat-table">
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th>Decided</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((r) => (
                <tr key={r.id}>
                  <td>{r.playerName}</td>
                  <td className="num">
                    <Figure cents={r.status === 'approved' ? (r.grantedAmount ?? r.amount) : 0} />
                  </td>
                  <td className={r.status === 'approved' ? 'is-up' : 'is-down'}>{r.status}</td>
                  <td>{r.decidedAt ? new Date(r.decidedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  )
}
