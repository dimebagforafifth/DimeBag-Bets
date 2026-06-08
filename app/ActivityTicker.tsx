/**
 * The live activity ticker (CLAUDE.md §2) — a compact, newest-first feed of
 * recent bets and big wins across the book. Read-only: it subscribes to the
 * session ledger feed (release-timed, so it never spoils a live result) and the
 * book (for player names), and renders the shaped items from app/activity-feed.
 * It moves no money and touches no core state.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { getLedger, subscribeLedger } from './ledger-store.js'
import { getBook, subscribeBook, getBookVersion } from './book-store.js'
import { toTickerItems, type TickerItem } from './activity-feed.js'
import { formatMoney } from '../games/shared/money.js'
import './activity.css'

export function ActivityTicker({ limit = 10 }: { limit?: number }) {
  // newest-first session feed (stable ref between movements)
  const feed = useSyncExternalStore(subscribeLedger, getLedger, getLedger)
  // re-render when the book changes (a player's name/nickname could move)
  useSyncExternalStore(subscribeBook, getBookVersion, getBookVersion)

  const items = useMemo(() => {
    const names = new Map<string, string>()
    const members = getBook().members
    for (const id of Object.keys(members)) {
      const m = members[id]
      names.set(id, m.profile?.nickname || m.name)
    }
    return toTickerItems(feed, names, { limit })
  }, [feed, limit])

  if (items.length === 0) return null
  return (
    <section className="activity" aria-label="Recent betting activity">
      <header className="activity-head">
        <span className="activity-live">
          <span className="activity-dot" aria-hidden="true" />
          Live activity
        </span>
      </header>
      <ul className="activity-list">
        {items.map((it) => (
          <ActivityRow key={it.id} item={it} />
        ))}
      </ul>
    </section>
  )
}

function ActivityRow({ item }: { item: TickerItem }) {
  const won = item.outcome === 'win'
  const returned = item.outcome === 'push' || item.outcome === 'void'
  const tone = won ? (item.big ? 'big' : 'win') : returned ? 'flat' : 'loss'
  return (
    <li className={`activity-row is-${tone}`}>
      <span className="activity-who">{item.player}</span>
      <span className="activity-what">
        {won ? (
          <>
            won <strong>{formatMoney(item.profit)}</strong>
            {item.multiplier >= 2 && <span className="activity-mult">{item.multiplier.toFixed(2)}×</span>}
            {item.big && (
              <span className="activity-big" aria-label="big win">
                🔥
              </span>
            )}
          </>
        ) : returned ? (
          <>
            {item.outcome === 'push' ? 'pushed' : 'voided'} — stake back
          </>
        ) : (
          <>
            lost <strong>{formatMoney(item.stake)}</strong>
          </>
        )}
      </span>
      <span className="activity-game">{item.game}</span>
    </li>
  )
}
