/**
 * Head-to-head — two players side by side over a chosen window, leader marked per metric. A pure
 * read-model: every number is each player's own projection, so an H2H row reconciles to that
 * player's individual profile. No money path.
 */

import { useState, type ReactNode } from 'react'
import { profileStats, STATS_WINDOWS, type StatsWindow } from '../projection.js'
import { compareHeadToHead, type H2HLeader, type H2HRow } from '../head-to-head.js'
import { canView } from '../privacy.js'
import { moneyTone, pct, signedMoney, units as fmtUnits } from './bits.js'

function cellText(row: H2HRow, side: 'a' | 'b'): string {
  const v = side === 'a' ? row.a : row.b
  switch (row.format) {
    case 'money':
      return signedMoney(v)
    case 'percent':
      return pct(v)
    case 'record':
      return (side === 'a' ? row.aText : row.bText) ?? '—'
    case 'number':
      return row.key === 'units' ? fmtUnits(v) : String(Math.round(v))
  }
}

function cellTone(row: H2HRow, side: 'a' | 'b'): string {
  if (row.format === 'money') return moneyTone(side === 'a' ? row.a : row.b)
  if (row.format === 'percent' && row.key === 'roi') return moneyTone(side === 'a' ? row.a : row.b)
  return ''
}

export function HeadToHead({
  viewerId,
  now,
  players,
}: {
  viewerId: string
  now: number
  players: { id: string; name: string }[]
}): ReactNode {
  // PRIVACY: only compare players whose stats the viewer may see (plus the viewer themselves) —
  // H2H can't be a side-channel around a private/followers-only profile.
  const visible = players.filter((p) => p.id === viewerId || canView(viewerId, p.id, 'stats'))
  const defaultA = visible.some((p) => p.id === viewerId) ? viewerId : (visible[0]?.id ?? '')
  const defaultB = visible.find((p) => p.id !== defaultA)?.id ?? defaultA
  const [aId, setAId] = useState<string>(defaultA)
  const [bId, setBId] = useState<string>(defaultB)
  const [window, setWindow] = useState<StatsWindow>('lifetime')

  if (visible.length < 2 || !aId || !bId) {
    return <p className="prof-empty">Need at least two players with visible stats to compare.</p>
  }

  // If a prior selection is no longer visible (privacy changed), fall back to a visible default.
  const okA = visible.some((p) => p.id === aId) ? aId : defaultA
  const okB = visible.some((p) => p.id === bId) ? bId : defaultB
  const h2h = compareHeadToHead(profileStats(okA, now), profileStats(okB, now), window)

  const winnerClass = (leader: H2HLeader, side: 'a' | 'b'): string =>
    leader === side ? 'is-leader' : ''

  return (
    <section className="prof-h2h">
      <div className="prof-h2h-pickers">
        <select
          className="prof-switch"
          value={okA}
          onChange={(e) => setAId(e.target.value)}
          aria-label="Player A"
        >
          {visible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="prof-h2h-vs">vs</span>
        <select
          className="prof-switch"
          value={okB}
          onChange={(e) => setBId(e.target.value)}
          aria-label="Player B"
        >
          {visible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="prof-windows">
        {STATS_WINDOWS.map((w) => (
          <button
            key={w.key}
            className={`chip ${window === w.key ? 'is-on' : ''}`}
            onClick={() => setWindow(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="prof-h2h-score">
        <span className={`prof-h2h-name ${h2h.score.a > h2h.score.b ? 'is-leader' : ''}`}>
          {h2h.a.name}
        </span>
        <span className="prof-h2h-tally">
          {h2h.score.a} – {h2h.score.b}
        </span>
        <span className={`prof-h2h-name ${h2h.score.b > h2h.score.a ? 'is-leader' : ''}`}>
          {h2h.b.name}
        </span>
      </div>

      <div className="prof-h2h-table">
        {h2h.rows.map((row) => (
          <div className="prof-h2h-row" key={row.key}>
            <span className={`prof-h2h-a ${winnerClass(row.leader, 'a')} ${cellTone(row, 'a')}`}>
              {cellText(row, 'a')}
            </span>
            <span className="prof-h2h-metric">{row.label}</span>
            <span className={`prof-h2h-b ${winnerClass(row.leader, 'b')} ${cellTone(row, 'b')}`}>
              {cellText(row, 'b')}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
