import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  EVENTS,
  SPORTS,
  type GameEvent,
  type MarketKind,
  type Selection,
} from '../../sportsbook/markets.js'
import {
  applyOverlay,
  subscribeOverlay,
  getOverlayVersion,
  isEventSuspended,
  isMarketSuspended,
  isMarketAdjusted,
  setEventSuspended,
  setMarketSuspended,
  nudgeLine,
  resetMarket,
} from '../../sportsbook/book/overlay.js'
import { formatAmerican } from '../../sportsbook/odds.js'
import * as gameAdmin from './game-admin-store.js'
import './catalog.css'
import './game-admin.css'

/**
 * Game Admin (CLAUDE.md §4) — the operator's per-game market manager, as a clean
 * sport → league → game TREE instead of cramped icon rows. It's the headline
 * Catalog build: search a fixture, open it, and manage it inline — enable/disable
 * the game, circle it (reduced limits), set a per-game coin limit, and per market
 * lock it, move the line, or reset.
 *
 * Two of those flags route straight to the shared book overlay
 * (sportsbook/book/overlay.ts) so a change hits every player at once — the same
 * singleton the trading desk writes: setEventSuspended / setMarketSuspended /
 * nudgeLine / resetMarket. The overlay only manages `upcoming` (pre-game) markets,
 * so live/final games show read-only here (the feed owns them once they start).
 *
 * The other two flags — "circled" and the per-game limit — have no field in
 * core/overlay yet, so they live in a small sibling store (game-admin-store.ts) as
 * a // SEAM until per-game limits land in core/book. // TODO(api).
 *
 * COINS ONLY: limits are whole coins; no real-money symbols anywhere (§1).
 */

const MARKETS: MarketKind[] = ['moneyline', 'spread', 'total']
const MARKET_LABEL: Record<MarketKind, string> = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  total: 'Total',
}

/** Betting periods. Only "game" maps to a real (full-game) line on today's feed. */
type Period = 'game' | 'half' | 'quarter'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'game', label: 'Game' },
  { key: 'half', label: 'Half' },
  { key: 'quarter', label: 'Quarter' },
]

const sgnNum = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

/** Whole coins with thousands grouping — our own coins-only formatter (never "$"). */
function formatCoins(coins: number): string {
  return coins.toLocaleString('en-US')
}

/** Short side label for a price chip. */
function pickLabel(s: Selection, e: GameEvent): string {
  if (s.market === 'total') return s.pick === 'over' ? 'Over' : 'Under'
  return s.pick === 'home' ? e.home : e.away
}

/* ------------------------------- the panel ------------------------------- */

export function GameAdminPanel({ onBack }: { onBack: () => void }) {
  // Re-render on either store changing so every toggle reflects live.
  useSyncExternalStore(subscribeOverlay, getOverlayVersion)
  useSyncExternalStore(gameAdmin.subscribe, gameAdmin.getVersion)
  void onBack // the shell owns Back; this body may ignore it.

  const [query, setQuery] = useState('')
  const [sport, setSport] = useState<string>('all')

  // The slate the players see — feed events with the book overlay applied, so the
  // line values shown already include any operator shift.
  const slate = applyOverlay(EVENTS)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return slate.filter((e) => {
      if (sport !== 'all' && e.sport !== sport) return false
      if (!q) return true
      return (
        e.home.toLowerCase().includes(q) ||
        e.away.toLowerCase().includes(q) ||
        e.league.toLowerCase().includes(q) ||
        e.sport.toLowerCase().includes(q)
      )
    })
  }, [slate, query, sport])

  // Group surviving fixtures into sport → league → games, preserving slate order.
  const tree = useMemo(() => {
    const bySport = new Map<string, Map<string, GameEvent[]>>()
    for (const e of matches) {
      let leagues = bySport.get(e.sport)
      if (!leagues) {
        leagues = new Map()
        bySport.set(e.sport, leagues)
      }
      const games = leagues.get(e.league)
      if (games) games.push(e)
      else leagues.set(e.league, [e])
    }
    return bySport
  }, [matches])

  return (
    <div className="feat">
      <header className="ga-head">
        <div className="ga-search-row">
          <input
            className="feat-input ga-search"
            type="search"
            placeholder="Search team, league or sport…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search games"
          />
          <select
            className="feat-input ga-sport-filter"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            aria-label="Filter by sport"
          >
            <option value="all">All sports</option>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <p className="ga-count">
          {matches.length} game{matches.length === 1 ? '' : 's'}
          {sport !== 'all' ? ` · ${sport}` : ''}
          {query.trim() ? ` · “${query.trim()}”` : ''}
        </p>
      </header>

      {matches.length === 0 ? (
        <p className="feat-empty">No games match — clear the search or pick another sport.</p>
      ) : (
        <div className="ga-tree">
          {[...tree.entries()].map(([sportName, leagues]) => {
            const gamesInSport = [...leagues.values()].reduce((n, g) => n + g.length, 0)
            return (
              <section key={sportName} className="ga-sport">
                <h3 className="ga-sport-h">
                  {sportName}
                  <span className="ga-count">{gamesInSport}</span>
                </h3>
                {[...leagues.entries()].map(([league, games]) => (
                  <div key={league} className="ga-league">
                    <p className="ga-league-h">
                      {league} · {games.length}
                    </p>
                    {games.map((e) => (
                      <GameCard key={e.id} event={e} />
                    ))}
                  </div>
                ))}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* -------------------------------- a game --------------------------------- */

function GameCard({ event }: { event: GameEvent }) {
  const [period, setPeriod] = useState<Period>('game')
  const suspended = isEventSuspended(event.id)
  const circled = gameAdmin.isCircled(event.id)
  const limit = gameAdmin.getLimit(event.id)
  // The overlay only manages pre-game markets; once live/final the feed owns it.
  const manageable = event.status === 'upcoming'
  // SEAM: period-specific lines arrive from the feed (period markets). // TODO(api)
  const realPeriod = period === 'game'

  return (
    <div className={`ga-game ${suspended ? 'is-off' : ''}`}>
      <div className="ga-game-head">
        <span className="ga-teams">
          {event.away} <span className="ga-at">@</span> {event.home}
        </span>
        <span className="ga-when">{event.startsAt}</span>
        {suspended && <span className="ga-chip is-off">Disabled</span>}
        {circled && <span className="ga-chip is-circled">Circled</span>}
        {limit != null && <span className="ga-chip">Max {formatCoins(limit)} coins</span>}
        {!manageable && <span className="ga-chip">{event.status}</span>}
      </div>

      <div className="ga-controls">
        <div className="ga-periods" role="tablist" aria-label="Betting period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={period === p.key}
              className={`ga-period ${period === p.key ? 'is-on' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`feat-btn ga-btn ${suspended ? 'is-danger' : ''}`}
          disabled={!manageable}
          onClick={() => setEventSuspended(event.id, !suspended)}
        >
          {suspended ? 'Enable game' : 'Disable game'}
        </button>

        <button
          type="button"
          className={`feat-btn ga-btn ${circled ? 'is-on' : ''}`}
          aria-pressed={circled}
          onClick={() => gameAdmin.setCircled(event.id, !circled)}
        >
          {circled ? 'Uncircle' : 'Circle'}
        </button>

        <label className="ga-ctl">
          <span className="ga-ctl-label">Limit</span>
          <input
            className="feat-input ga-limit-input"
            type="number"
            min={0}
            step={50}
            inputMode="numeric"
            placeholder="none"
            value={limit ?? ''}
            onChange={(ev) => {
              const v = ev.target.value
              gameAdmin.setLimit(event.id, v === '' ? null : Number(v))
            }}
            aria-label={`Max coins on ${event.away} at ${event.home}`}
          />
          <span className="ga-coins">coins</span>
        </label>
      </div>

      {!realPeriod && (
        <p className="ga-period-note">
          {PERIODS.find((p) => p.key === period)!.label} lines aren’t on the feed yet — full-game
          markets only for now.
        </p>
      )}

      <div className={`ga-markets ${!manageable || !realPeriod || suspended ? 'is-disabled' : ''}`}>
        {MARKETS.map((m) => (
          <MarketRow
            key={m}
            event={event}
            market={m}
            disabled={!manageable || !realPeriod || suspended}
          />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------- a market -------------------------------- */

function MarketRow({
  event,
  market,
  disabled,
}: {
  event: GameEvent
  market: MarketKind
  disabled: boolean
}) {
  const sels = event.selections.filter((s) => s.market === market)
  const locked = isMarketSuspended(event.id, market)
  const managed = isMarketAdjusted(event.id, market)
  const hasLine = market !== 'moneyline'
  const line = sels[0]?.line ?? 0

  return (
    <div className={`ga-mkt ${locked ? 'is-locked' : ''}`}>
      <span className="ga-mkt-name">
        {MARKET_LABEL[market]}
        {managed && <span className="ga-dot" title="Managed — adjusted off the feed" />}
      </span>

      <span className="ga-mkt-prices">
        {sels.map((s) => (
          <span key={s.id} className="ga-price">
            <b>{pickLabel(s, event)}</b>
            <span className="ga-price-odds">{formatAmerican(s.odds)}</span>
          </span>
        ))}
      </span>

      {hasLine ? (
        <span className="ga-line">
          <button
            type="button"
            className="ga-step"
            aria-label={`Lower the ${MARKET_LABEL[market]} line`}
            disabled={disabled || locked}
            onClick={() => nudgeLine(event.id, market, -0.5)}
          >
            −½
          </button>
          <span className="ga-line-val">{market === 'spread' ? sgnNum(line) : line}</span>
          <button
            type="button"
            className="ga-step"
            aria-label={`Raise the ${MARKET_LABEL[market]} line`}
            disabled={disabled || locked}
            onClick={() => nudgeLine(event.id, market, 0.5)}
          >
            +½
          </button>
        </span>
      ) : (
        <span className="ga-line-na">—</span>
      )}

      <span className="ga-mkt-actions">
        <button
          type="button"
          className={`ga-mini-btn ${locked ? 'is-on' : ''}`}
          disabled={disabled}
          onClick={() => setMarketSuspended(event.id, market, !locked)}
        >
          {locked ? 'Unlock' : 'Lock'}
        </button>
        <button
          type="button"
          className="ga-mini-btn"
          disabled={disabled || !managed}
          aria-label={`Reset the ${MARKET_LABEL[market]}`}
          onClick={() => resetMarket(event.id, market)}
        >
          Reset
        </button>
      </span>
    </div>
  )
}
