import { useMemo, useState, useSyncExternalStore } from 'react'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { formatMoney } from '../../games/shared/money.js'
import { ScopeBar, scopedPlayers, ALL_SCOPE } from '../_desk/scope.js'
import './players.css'

interface Standing {
  id: string
  name: string
  figure: number
}

/**
 * Player Performance — top & bottom movers by this period's figure, scoped to the whole
 * book or one agent's roster. A focused leaderboard of who's up and who's down.
 */
export function PerformancePanel() {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const [scope, setScope] = useState(ALL_SCOPE)

  const { winners, losers } = useMemo(() => {
    const standings: Standing[] = scopedPlayers(getBook(), scope).map((p) => ({
      id: p.id,
      name: p.name,
      figure: p.account.balance,
    }))
    const up = standings
      .filter((s) => s.figure > 0)
      .sort((a, b) => b.figure - a.figure)
      .slice(0, 8)
    const down = standings
      .filter((s) => s.figure < 0)
      .sort((a, b) => a.figure - b.figure)
      .slice(0, 8)
    return { winners: up, losers: down }
    // bv is the change signal
  }, [bv, scope])

  return (
    <div className="feat">
      <ScopeBar org={getBook()} value={scope} onChange={setScope} />
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
