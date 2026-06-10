/**
 * Live Activity / Bet Ticker (CLAUDE.md §2 "clean, fast", §3 the shared figure) —
 * the operator's real-time feed of every bet as it SETTLES across the whole book:
 * casino games + the sportsbook, on one shared balance. Read-only: it moves no
 * money and touches no core state — it only shapes the session ledger feed
 * (app/ledger-store, which is release-timed so a result never shows here before the
 * player who made it has seen it) into display rows.
 *
 * This is the DEEPENED panel. Rather than wrap app/ActivityTicker, it builds its own
 * FILTERED ticker so an operator can drill in: filter by product (All / Sportsbook /
 * any casino gameKey present in the feed), by outcome (All / Wins / Losses), and a
 * "big wins only" toggle on TickerItem.big. A live count tracks how many bets match.
 * Newest first; coin deltas only — rendered with a local coins-only formatter, never
 * formatMoney() (whose operator display defaults to a "$" mark, which this lane forbids).
 * Big wins are emphasised in gold.
 *
 * Wrapped in <PanelShell> per the operations-panel contract (so .feat-panel exists
 * and Escape→onBack works). Reactive via useSyncExternalStore over the ledger feed
 * (for activity) and the book (for player names).
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import { getLedger, subscribeLedger } from '../../app/ledger-store.js'
import { getBook, subscribeBook, getBookVersion } from '../../app/book-store.js'
import { toTickerItems, type TickerItem } from '../../app/activity-feed.js'
import { PanelShell } from './shared.js'
import './live-activity.css'

/** Pull plenty of recent bets so the filters have something to chew on. */
const FEED_LIMIT = 200

type OutcomeFilter = 'all' | 'win' | 'loss'
/** 'all' | 'sportsbook' | a casino gameKey present in the feed. */
type ProductFilter = string

export function LiveActivityPanel({ onBack }: { onBack: () => void }) {
  // newest-first session feed (stable ref between movements)
  const feed = useSyncExternalStore(subscribeLedger, getLedger, getLedger)
  // re-render AND recompute the names map when the book changes (a player's
  // name/nickname could move even when no new bet has landed)
  const bookVersion = useSyncExternalStore(subscribeBook, getBookVersion, getBookVersion)

  const [product, setProduct] = useState<ProductFilter>('all')
  const [outcome, setOutcome] = useState<OutcomeFilter>('all')
  const [bigOnly, setBigOnly] = useState(false)

  // Shape the raw ledger into ticker items, tagged with each player's display name.
  const items = useMemo(() => {
    const names = new Map<string, string>()
    const members = getBook().members
    for (const id of Object.keys(members)) {
      const m = members[id]
      names.set(id, m.profile?.nickname || m.name)
    }
    return toTickerItems(feed, names, { limit: FEED_LIMIT })
  }, [feed, bookVersion])

  // Distinct products present in the feed → the product filter options. We key on
  // gameKey (stable) but show the human label (item.game); the sportsbook is folded
  // under a single "sportsbook" option even if its gameKey varies.
  const products = useMemo(() => distinctProducts(items), [items])

  const filtered = useMemo(
    () =>
      items.filter((it) => {
        if (product !== 'all' && productKeyOf(it) !== product) return false
        if (outcome === 'win' && it.outcome !== 'win') return false
        if (outcome === 'loss' && it.outcome !== 'loss') return false
        if (bigOnly && !it.big) return false
        return true
      }),
    [items, product, outcome, bigOnly],
  )

  return (
    <PanelShell onBack={onBack}>
      <header className="la-head">
        <span className="la-live">
          <span className="la-dot" aria-hidden="true" />
          Live activity
        </span>
        <span className="la-count" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'bet' : 'bets'}
        </span>

        <span className="la-spacer" />

        <div className="la-filters" role="group" aria-label="Filter activity">
          <Segment
            label="Product"
            value={product}
            onChange={setProduct}
            options={[{ value: 'all', label: 'All' }, ...products]}
          />
          <Segment
            label="Outcome"
            value={outcome}
            onChange={setOutcome}
            options={[
              { value: 'all', label: 'All' },
              { value: 'win', label: 'Wins' },
              { value: 'loss', label: 'Losses' },
            ]}
          />
          <label className={`la-toggle${bigOnly ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={bigOnly}
              onChange={(e) => setBigOnly(e.target.checked)}
            />
            Big wins only
          </label>
        </div>
      </header>

      {items.length === 0 ? (
        // No activity AT ALL — keep the exact copy the tests assert on.
        <p className="feat-empty">
          No betting activity yet — bets appear here the moment they settle.
        </p>
      ) : filtered.length === 0 ? (
        // Activity exists, but the filter excludes all of it.
        <p className="feat-empty">No activity matches these filters.</p>
      ) : (
        <ul className="la-list">
          {filtered.map((it) => (
            <Row key={it.id} item={it} />
          ))}
        </ul>
      )}
    </PanelShell>
  )
}

/** One feed row: player (bold) + verb + coin delta (right-aligned, tabular) + game. */
function Row({ item }: { item: TickerItem }) {
  const won = item.outcome === 'win'
  const lost = item.outcome === 'loss'
  const returned = item.outcome === 'push' || item.outcome === 'void'
  const verb = won ? 'won' : lost ? 'lost' : item.outcome === 'push' ? 'pushed' : 'void'
  // The signed figure move: profit is already negative on a loss; push/void are 0.
  const deltaTone = item.profit > 0 ? 'is-up' : item.profit < 0 ? 'is-down' : 'is-flat'

  return (
    <li className={`la-row${item.big ? ' is-big' : ''}`}>
      <span className="la-line">
        <span className="la-who">{item.player}</span>
        <span className="la-verb">{verb}</span>
        {won && item.multiplier >= 2 && (
          <span className="la-mult">{item.multiplier.toFixed(2)}×</span>
        )}
        {item.big && (
          <span className="la-flame" aria-label="big win" title="Big win">
            🔥
          </span>
        )}
      </span>
      <span className={`la-delta ${deltaTone}`}>
        {returned ? 'stake back' : signedCoins(item.profit)}
      </span>
      <span className="la-game">{item.game}</span>
    </li>
  )
}

/** A labelled segmented control. Generic over the filter value's string type. */
function Segment<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="la-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`la-seg-btn${o.value === value ? ' is-on' : ''}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A bet's product key for filtering: the sportsbook collapses to one bucket; every
 *  casino game keeps its own gameKey. Heuristic on gameKey/game so any sportsbook
 *  grade lands under "sportsbook" regardless of the exact key the shell tagged it. */
function productKeyOf(it: TickerItem): string {
  const k = (it.gameKey || '').toLowerCase()
  if (k.includes('sport') || k.includes('book') || it.game.toLowerCase().includes('sportsbook')) {
    return 'sportsbook'
  }
  return it.gameKey
}

/** Distinct product options present in the feed (stable, first-seen order), labelled
 *  with the human game name. The sportsbook appears once. */
function distinctProducts(items: TickerItem[]): { value: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const it of items) {
    const key = productKeyOf(it)
    if (!seen.has(key)) {
      seen.set(key, key === 'sportsbook' ? 'Sportsbook' : it.game)
    }
  }
  return [...seen].map(([value, label]) => ({ value, label }))
}

/** A figure delta as a plain coin amount, signed (+ on a gain, − on a loss). Never
 *  formatMoney(): that renders the operator's display symbol (a "$" by default), and a
 *  points-only book must never show a currency mark here (CLAUDE.md §1, console brief). */
function signedCoins(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : ''
  const num = (Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}${num} coins`
}
