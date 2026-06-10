import { useSyncExternalStore } from 'react'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { winnersLosers, type Standing } from '../../app/risk.js'
import { formatMoney } from '../../games/shared/money.js'
import './players.css'

/**
 * Player Performance — top & bottom movers by this period's figure (NOT downline
 * reporting). Adapts the existing `winnersLosers` analytics (app/risk) into a focused
 * leaderboard of who's up and who's down for the operator's eye.
 */
export function PerformancePanel() {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const { winners, losers } = winnersLosers(getBook(), 8)
  return (
    <div className="feat">
      <div className="feat-cols">
        <Movers title="Top movers" rows={winners} tone="up" empty="No players up this period." />
        <Movers
          title="Bottom movers"
          rows={losers}
          tone="down"
          empty="No players down this period."
        />
      </div>
    </div>
  )
}

function Movers({
  title,
  rows,
  tone,
  empty,
}: {
  title: string
  rows: Standing[]
  tone: 'up' | 'down'
  empty: string
}) {
  return (
    <div className="feat-board">
      <h3 className="feat-h">{title}</h3>
      {rows.length === 0 ? (
        <p className="feat-empty">{empty}</p>
      ) : (
        rows.map((r, i) => (
          <div key={r.id} className="feat-row">
            <span className="feat-rank">{i + 1}</span>
            <span className="feat-rowname">{r.name}</span>
            <span className={`feat-fig is-${tone}`}>
              {r.figure > 0 ? '+' : ''}
              {formatMoney(r.figure)}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
