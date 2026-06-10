import { useMemo, useState, useSyncExternalStore } from 'react'
import { membersByRole } from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { formatMoney } from '../../games/shared/money.js'
import {
  ensureSeeded,
  listOpenTickets,
  subscribeTickets,
  getTicketsVersion,
  gradeTicket,
  riskOf,
  toWinOf,
  type Grade,
} from './tickets.js'
import './players.css'

const GRADES: { g: Grade; label: string; cls: string }[] = [
  { g: 'win', label: 'Win', cls: 'is-win' },
  { g: 'loss', label: 'Loss', cls: 'is-loss' },
  { g: 'push', label: 'Push', cls: 'is-push' },
  { g: 'void', label: 'Void', cls: 'is-void' },
]

/**
 * Pending — open (ungraded) tickets across the book. Filter by player / sport / type;
 * Risk and To-Win totals sit up top. Each ticket grades manually (Win / Loss / Push /
 * Void) through `core.resolveWager`, moving the figure and posting to the durable ledger.
 *
 * // SEAM: open manual tickets written by the catalog Ticketwriter should register in the
 * // tickets store (addTicket) and surface here; the queue is seeded locally until then.
 */
export function PendingPanel({ onBack: _onBack }: { onBack: () => void }) {
  ensureSeeded() // lazy + idempotent: fill the demo queue on first render (no store churn)
  useSyncExternalStore(subscribeTickets, getTicketsVersion)
  useSyncExternalStore(subscribeBook, getBookVersion)

  const [player, setPlayer] = useState('all')
  const [sport, setSport] = useState('all')
  const [type, setType] = useState('all')

  const all = listOpenTickets()
  const sports = useMemo(() => ['all', ...new Set(all.map((t) => t.sport))], [all])
  const types = useMemo(() => ['all', ...new Set(all.map((t) => t.type))], [all])
  const players = membersByRole(getBook(), 'player')

  const rows = all.filter(
    (t) =>
      (player === 'all' || t.playerId === player) &&
      (sport === 'all' || t.sport === sport) &&
      (type === 'all' || t.type === type),
  )
  const risk = rows.reduce((s, t) => s + riskOf(t), 0)
  const toWin = rows.reduce((s, t) => s + toWinOf(t), 0)

  return (
    <div className="feat">
      <div className="feat-kpis">
        <div className="feat-kpi">
          <span className="feat-label">Open tickets</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Risk (at stake)</span>
          <strong>{formatMoney(risk)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">To win (book liability)</span>
          <strong>{formatMoney(toWin)}</strong>
        </div>
      </div>

      <div className="feat-toolbar">
        <Filter label="Player" value={player} onChange={setPlayer}
          options={[{ v: 'all', l: 'All players' }, ...players.map((p) => ({ v: p.id, l: p.name }))]} />
        <Filter label="Sport" value={sport} onChange={setSport}
          options={sports.map((s) => ({ v: s, l: s === 'all' ? 'All sports' : s }))} />
        <Filter label="Type" value={type} onChange={setType}
          options={types.map((t) => ({ v: t, l: t === 'all' ? 'All types' : t }))} />
      </div>

      {rows.length === 0 ? (
        <p className="feat-empty">No open tickets awaiting grade.</p>
      ) : (
        <div className="feat-tablewrap">
          <table className="feat-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Sport</th>
                <th>Type</th>
                <th>Selection</th>
                <th className="feat-num">Price</th>
                <th className="feat-num">Risk</th>
                <th className="feat-num">To win</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.playerName}</td>
                  <td>{t.sport}</td>
                  <td>{t.type}</td>
                  <td>{t.selection}</td>
                  <td className="feat-num">{t.price.toFixed(2)}</td>
                  <td className="feat-num">{formatMoney(riskOf(t))}</td>
                  <td className="feat-num">{formatMoney(toWinOf(t))}</td>
                  <td>
                    <span className="feat-grade">
                      {GRADES.map(({ g, label, cls }) => (
                        <button
                          key={g}
                          type="button"
                          className={`feat-gradebtn ${cls}`}
                          onClick={() => gradeTicket(t.id, g)}
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { v: string; l: string }[]
}) {
  return (
    <label className="feat-field">
      <span>{label}</span>
      <select className="feat-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  )
}
