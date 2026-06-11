/**
 * Pending Bets — NEW panel (no single existing component listed open exposure). Built
 * from existing read-only stores: app/exposure (open, ungraded stake per game) and the
 * org figures (each player's at-risk `account.pending`). It shows where dollars are tied
 * up awaiting grade. Moves no money.
 *
 * Seam: per-ticket drill-down (one row per open wager) needs an open-wagers selector
 * the exposure tracker keeps internally; surfaced as totals here until that lands.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import {
  getExposureByGame,
  getExposureVersion,
  subscribeExposure,
  totalOpenExposure,
} from '../../app/exposure.js'
import { PanelShell } from './shared.js'
import { ScopeBar, scopedPlayers, ALL_SCOPE } from '../_desk/scope.js'

export function PendingPanel({ onBack }: { onBack: () => void }) {
  const ev = useSyncExternalStore(subscribeExposure, getExposureVersion)
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const [scope, setScope] = useState(ALL_SCOPE)
  const wholeBook = scope === ALL_SCOPE

  const view = useMemo(() => {
    const org = getBook()
    const players = scopedPlayers(org, scope)
      .map((p) => ({ id: p.id, name: p.name, pending: p.account.pending }))
      .filter((p) => p.pending > 0)
      .sort((a, b) => b.pending - a.pending)
    // The by-game breakdown is book-wide (not player-attributed), so it only applies to
    // the whole-book view; a scoped total sums just that roster's at-risk stake.
    const byGame = wholeBook ? getExposureByGame() : []
    const total = wholeBook ? totalOpenExposure() : players.reduce((s, p) => s + p.pending, 0)
    return { byGame, total, players }
  }, [ev, bv, scope, wholeBook])

  const empty = view.byGame.length === 0 && view.players.length === 0

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Open tickets awaiting grade — dollars currently at risk
          {wholeBook ? ' across the book.' : ' for this agent’s roster.'}
        </p>
      </header>

      <ScopeBar org={getBook()} value={scope} onChange={setScope} />

      <section className="feat-kpis" aria-label="Pending summary">
        <div className="feat-kpi">
          <span className="feat-label">Total at risk</span>
          <strong>{formatMoney(view.total)}</strong>
        </div>
        {wholeBook && (
          <div className="feat-kpi">
            <span className="feat-label">Games with action</span>
            <strong>{view.byGame.length}</strong>
          </div>
        )}
        <div className="feat-kpi">
          <span className="feat-label">Players with bets</span>
          <strong>{view.players.length}</strong>
        </div>
      </section>

      {empty ? (
        <p className="feat-empty">No open tickets — nothing is awaiting grade right now.</p>
      ) : (
        <div className="feat-grid">
          {wholeBook && (
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
          )}
          <section className="feat-card" aria-label="At risk by player">
            <h2 className="feat-h2">At risk by player</h2>
            {view.players.length === 0 ? (
              <p className="feat-empty">No open tickets for this roster.</p>
            ) : (
              <ul className="feat-list">
                {view.players.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    <span className="feat-num">{formatMoney(p.pending)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PanelShell>
  )
}
