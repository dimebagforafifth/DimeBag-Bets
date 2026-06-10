/**
 * Pending Bets — NEW panel (no single existing component listed open exposure). Built
 * from existing read-only stores: app/exposure (open, ungraded stake per game) and the
 * org figures (each player's at-risk `account.pending`). It shows where coins are tied
 * up awaiting grade. Moves no money.
 *
 * Seam: per-ticket drill-down (one row per open wager) needs an open-wagers selector
 * the exposure tracker keeps internally; surfaced as totals here until that lands.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { membersByRole } from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import {
  getExposureByGame,
  getExposureVersion,
  subscribeExposure,
  totalOpenExposure,
} from '../../app/exposure.js'
import { PanelShell } from './shared.js'

export function PendingPanel({ onBack }: { onBack: () => void }) {
  const ev = useSyncExternalStore(subscribeExposure, getExposureVersion)
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)

  const view = useMemo(() => {
    const byGame = getExposureByGame()
    const players = membersByRole(getBook(), 'player')
      .map((p) => ({ id: p.id, name: p.name, pending: p.account.pending }))
      .filter((p) => p.pending > 0)
      .sort((a, b) => b.pending - a.pending)
    return { byGame, total: totalOpenExposure(), players }
  }, [ev, bv])

  const empty = view.byGame.length === 0 && view.players.length === 0

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Open tickets awaiting grade — coins currently at risk across the book.
        </p>
      </header>

      <section className="feat-kpis" aria-label="Pending summary">
        <div className="feat-kpi">
          <span className="feat-label">Total at risk</span>
          <strong>{formatMoney(view.total)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Games with action</span>
          <strong>{view.byGame.length}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Players with bets</span>
          <strong>{view.players.length}</strong>
        </div>
      </section>

      {empty ? (
        <p className="feat-empty">No open tickets — nothing is awaiting grade right now.</p>
      ) : (
        <div className="feat-grid">
          <section className="feat-card" aria-label="Open by game">
            <h2 className="feat-h2">Open by game</h2>
            <ul className="feat-list">
              {view.byGame.map((g) => (
                <li key={g.key}>
                  <span>{g.name}</span>
                  <span className="feat-num">{formatMoney(g.open)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="feat-card" aria-label="At risk by player">
            <h2 className="feat-h2">At risk by player</h2>
            <ul className="feat-list">
              {view.players.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <span className="feat-num">{formatMoney(p.pending)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </PanelShell>
  )
}
