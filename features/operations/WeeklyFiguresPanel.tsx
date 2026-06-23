/**
 * Weekly Figures — NEW panel (no single existing component showed the live figures).
 * Built ENTIRELY from existing read-only data: each member's running figure is their
 * core `account.balance` (dollars won/lost this period); the book figure is the inverse
 * sum. This is the operator's weekly win/loss + settle view. Moves no money.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { membersByRole } from '../org/index.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { PanelShell } from './shared.js'

export function WeeklyFiguresPanel({ onBack }: { onBack: () => void }) {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)

  const view = useMemo(() => {
    const players = membersByRole(getBook(), 'player')
      .map((p) => ({ id: p.id, name: p.name, figure: p.account.balance }))
      .sort((a, b) => b.figure - a.figure)
    // A positive player figure means the book owes them (they're up) → the book is
    // down by that much. Book figure = the inverse sum.
    const bookFigure = players.reduce((s, p) => s - p.figure, 0)
    return {
      players,
      bookFigure,
      up: players.filter((p) => p.figure > 0).length,
      down: players.filter((p) => p.figure < 0).length,
    }
  }, [bv])

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        {/* No title here — the shell's WorkspaceContainer already shows the feature name. */}
        <p className="feat-sub">
          Each player&apos;s dollars won/lost this period, and the book&apos;s figure.
        </p>
      </header>

      <section className="feat-kpis" aria-label="Figures summary">
        <div className="feat-kpi">
          <span className="feat-label">Book figure</span>
          <strong className={view.bookFigure < 0 ? 'feat-down' : 'feat-up'}>
            {formatMoney(view.bookFigure)}
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Players up</span>
          <strong>{view.up}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Players down</span>
          <strong>{view.down}</strong>
        </div>
      </section>

      {view.players.length === 0 ? (
        <p className="feat-empty">No players on the book yet.</p>
      ) : (
        <table className="feat-table" aria-label="Player figures">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Figure</th>
              <th>Settle</th>
            </tr>
          </thead>
          <tbody>
            {view.players.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className={`num ${p.figure < 0 ? 'feat-down' : p.figure > 0 ? 'feat-up' : ''}`}>
                  {formatMoney(p.figure)}
                </td>
                <td className="feat-label">
                  {p.figure > 0 ? 'Pay player' : p.figure < 0 ? 'Collect' : 'Even'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PanelShell>
  )
}
