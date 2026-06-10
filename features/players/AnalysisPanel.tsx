import { useMemo, useState, useSyncExternalStore } from 'react'
import { setMaxWager } from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import { formatMoney } from '../../games/shared/money.js'
import {
  seedClvBets,
  rankByClv,
  withinWindow,
  type ClvSortKey,
  type PlayerClv,
} from './analysis.js'
import './players.css'

const WINDOWS: { label: string; days: number | null }[] = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: null },
]

const COLS: { key: ClvSortKey; label: string; num: true }[] = [
  { key: 'totalBets', label: 'Bets', num: true },
  { key: 'beatLine', label: 'Beat line', num: true },
  { key: 'avgClvPct', label: 'Avg CLV', num: true },
  { key: 'points', label: 'Points (P&L)', num: true },
  { key: 'handle', label: 'Handle', num: true },
  { key: 'sharpness', label: 'Sharpness', num: true },
]

/**
 * Player Analysis — closing-line value (CLV), the flagship players-lane analytic. Per
 * player over a window: bets, beat-line count + rate, average CLV %, points (P&L), a
 * sharpness score, and a suggested limit tightening you can apply (through core). A real
 * sortable analytics panel — sort by any column.
 *
 * // SEAM / TODO(api): the CLV engine is real; its bet history is seeded (closing prices
 * // aren't recorded yet). Swap seedClvBets for the durable ledger + odds feed when live.
 */
export function AnalysisPanel({ onBack: _onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const org = getBook()
  const [windowDays, setWindowDays] = useState<number | null>(30)
  const [sortKey, setSortKey] = useState<ClvSortKey>('sharpness')
  const [desc, setDesc] = useState(true)

  const allBets = useMemo(() => seedClvBets(org), [org])
  const rows = useMemo(() => {
    const scoped = withinWindow(allBets, windowDays, Date.now())
    return rankByClv(org, scoped, sortKey, desc)
  }, [allBets, org, windowDays, sortKey, desc])

  const sharpest = rows.reduce<PlayerClv | null>(
    (best, r) => (best == null || r.sharpness > best.sharpness ? r : best),
    null,
  )
  const totalBets = rows.reduce((s, r) => s + r.totalBets, 0)

  function sortBy(key: ClvSortKey) {
    if (key === sortKey) setDesc((d) => !d)
    else {
      setSortKey(key)
      setDesc(true)
    }
  }

  return (
    <div className="feat">
      <div className="feat-toolbar">
        <div className="feat-chips" aria-label="Window">
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              type="button"
              className={`feat-chip ${windowDays === w.days ? 'is-on' : ''}`}
              onClick={() => setWindowDays(w.days)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="feat-kpis">
        <div className="feat-kpi">
          <span className="feat-label">Sharpest player</span>
          <strong>{sharpest ? sharpest.playerName : '—'}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Top sharpness</span>
          <strong>{sharpest ? sharpest.sharpness : '—'}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Bets analysed</span>
          <strong>{totalBets}</strong>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="feat-empty">No bets in this window.</p>
      ) : (
        <div className="feat-tablewrap">
          <table className="feat-table">
            <thead>
              <tr>
                <th>Player</th>
                {COLS.map((c) => (
                  <th key={c.key} className="feat-num">
                    <button
                      type="button"
                      className={`feat-sort ${sortKey === c.key ? 'is-active' : ''}`}
                      onClick={() => sortBy(c.key)}
                    >
                      {c.label}
                      {sortKey === c.key && (
                        <span className="feat-sort-arrow">{desc ? '▼' : '▲'}</span>
                      )}
                    </button>
                  </th>
                ))}
                <th>Suggested limit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId}>
                  <td>{r.playerName}</td>
                  <td className="feat-num">{r.totalBets}</td>
                  <td className="feat-num">
                    {r.beatLine} · {Math.round(r.beatRate * 100)}%
                  </td>
                  <td className={`feat-num ${r.avgClvPct >= 0 ? 'feat-up' : 'feat-down'}`}>
                    {r.avgClvPct >= 0 ? '+' : ''}
                    {r.avgClvPct.toFixed(2)}%
                  </td>
                  <td className={`feat-num ${r.points >= 0 ? 'feat-up' : 'feat-down'}`}>
                    {r.points > 0 ? '+' : ''}
                    {formatMoney(r.points)}
                  </td>
                  <td className="feat-num">{formatMoney(r.handle)}</td>
                  <td className="feat-num">
                    <span className="feat-sharp">
                      <span className="feat-meter">
                        <span
                          className="feat-meter-fill"
                          style={{ width: `${r.sharpness}%` }}
                        />
                      </span>
                      {r.sharpness}
                    </span>
                  </td>
                  <td>
                    {r.suggestedMaxWager != null ? (
                      <span className="feat-inline">
                        <span className="feat-muted">→ {formatMoney(r.suggestedMaxWager)}</span>
                        <button
                          type="button"
                          className="feat-btn is-sm"
                          onClick={() =>
                            mutateBook(() => setMaxWager(org, r.playerId, r.suggestedMaxWager))
                          }
                        >
                          Apply
                        </button>
                      </span>
                    ) : (
                      <span className="feat-muted">—</span>
                    )}
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
