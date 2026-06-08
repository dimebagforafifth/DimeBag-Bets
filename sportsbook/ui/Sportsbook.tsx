import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Account } from '../../core/index.js'
import { availableToWager, maxBet } from '../../core/index.js'
import {
  americanFromDecimal,
  decimalFromAmerican,
  formatAmerican,
  futureDecimal,
  futureOverround,
  hasRelatedLegs,
  SPORTS,
  leaguesInSport,
  liveSelections,
  liveWinProb,
  potentialReturn,
  priceTicket,
  type FutureMarket,
  type FutureTicket,
  type GameEvent,
  type MarketKind,
  type PlaceTicketOptions,
  type Selection,
  type SportsbookStore,
  type Ticket,
} from '../index.js'
// Live board primitives — one source of truth for the LIVE/FINAL badge, the
// score, the price-movement tick, and the feed-status chip. Pure props in; the
// store feeds them the mock slate today and a real odds API later, unchanged.
import { LiveBadge, LiveScore, OddsTick, FeedStatus } from './live/index.js'
import { availableBetTypes, combinations, priceRoundRobin, type SlipSelection } from '../bets/index.js'
import { createLocalStore, persistedDoc, type Doc } from '../../persistence/index.js'
import { Rules } from '../../games/shared/Rules.js'
import { Term } from '../../games/shared/GlossaryTerm.js'
import { checkPlay } from '../../app/responsible-play.js'
import { formatMoney, toCents } from '../../games/shared/money.js'
import './sportsbook.css'

interface SportsbookProps {
  account: Account
  store: SportsbookStore
}

const MARKET_LABELS: Record<MarketKind, string> = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  total: 'Total',
}

/** How prices are displayed; a player preference, persisted across reloads. */
export type OddsFormat = 'american' | 'decimal'

/** Format an American price in the chosen style (decimal = total return per 1). */
function formatOdds(american: number, fmt: OddsFormat): string {
  return fmt === 'decimal' ? decimalFromAmerican(american).toFixed(2) : formatAmerican(american)
}

/** Odds format flows via context so every price chip honors it without prop-drilling. */
const OddsFormatContext = createContext<OddsFormat>('american')
function useFmtOdds(): (american: number) => string {
  const fmt = useContext(OddsFormatContext)
  return (american: number) => formatOdds(american, fmt)
}

/** How the current slip is being bet. A teaser mode arrives with the engine's
 *  teaser kind; round robin places as every N-leg parlay combination. */
type SlipMode = 'single' | 'parlay' | 'roundRobin' | 'sameGameParlay'

const MODE_LABEL: Record<SlipMode, string> = {
  single: 'Singles',
  parlay: 'Parlay',
  roundRobin: 'Round robin',
  sameGameParlay: 'Same Game',
}

/** Bridge a board `Selection` (American odds) to the `bets/` slip model (decimal
 *  odds) so the round-robin/teaser pricing built in that module drives the UI. */
function toSlipSelection(s: Selection): SlipSelection {
  return {
    id: s.id,
    eventId: s.eventId,
    label: s.label,
    market: s.market,
    decimal: decimalFromAmerican(s.odds),
    pick: s.pick,
    line: s.line,
  }
}

/** The meaningful round-robin combination sizes for `n` legs: 2 .. n−1 (the full
 *  n-leg combo is just a straight parlay, offered separately). */
function roundRobinSizes(n: number): number[] {
  const out: number[] = []
  for (let k = 2; k <= n - 1; k++) out.push(k)
  return out
}

/** Is this selection placeable right now? Pre-game needs upcoming; live needs live. */
function placeableNow(sel: Selection, statusById: Map<string, GameEvent['status']>): boolean {
  const status = statusById.get(sel.eventId)
  return sel.live ? status === 'live' : status === 'upcoming'
}

/** Re-quote a slip leg to its CURRENT posted price, so the slip always shows (and
 *  places at) the live line. A live leg re-prices off the score; a pre-game leg
 *  re-reads the book's current selection — which the manager may have moved, re-vigged,
 *  or suspended (see book/overlay.ts). */
function freshLeg(leg: Selection, events: GameEvent[]): Selection {
  const e = events.find((ev) => ev.id === leg.eventId)
  if (!e) return leg
  if (leg.live) {
    if (e.status !== 'live') return leg
    return liveSelections(e).find((s) => s.id === leg.id) ?? leg
  }
  return e.selections.find((s) => s.id === leg.id) ?? leg
}

const SPORTSBOOK_RULES: ReactNode[] = [
  'Tap any price on an upcoming game to add it to your bet slip — pick a moneyline side, a point spread, or a game total.',
  'Bet them as Singles (each its own wager) or combine them into a Parlay — one stake, every leg must win, the odds multiply.',
  'Once a game kicks off, its pre-game markets close but a Live moneyline opens — its price moves with the score, so you can bet in-play right up to the final whistle. Odds lock the moment you place.',
  'A tie on a spread or total is a push — stake back. In a parlay, a push or void leg drops out and it re-prices on the rest; one losing leg settles it immediately. Two picks from one game can’t be parlayed.',
  'A bet only stands if the game goes far enough to be official (e.g. an NFL full game, 43 of 48 minutes in the NBA, 5 innings in MLB). A postponed, abandoned or shortened game voids the affected bets — your stake comes back.',
  'Lines move. If one of your picks re-prices while it’s in the slip, we ask you to accept the new price before placing — your bet always locks at the price you confirm.',
  'Cash Out any open bet while a game is live — we buy it back at its live value (the win-probability bar shows how the game’s leaning). The only haircut is a 5% cash-out margin, shown up front, nothing hidden.',
  <>
    <strong>Payout = stake × the locked decimal odds; parlays cap at 299:1.</strong> Games here run on
    a simulated live feed — bets auto-settle the moment a game finals. Plug in a real odds/scores API
    and nothing else changes.
  </>,
]

/** Subscribe a component to the store; re-render on any change. */
function useStore(store: SportsbookStore) {
  const [, force] = useReducer((n: number) => n + 1, 0)
  useEffect(() => store.subscribe(force), [store])
  return store.getState()
}

export function Sportsbook({ account, store }: SportsbookProps) {
  const { events, tickets, futures, futureTickets, health } = useStore(store)
  const [tab, setTab] = useState<'games' | 'futures'>('games')
  const [futuresError, setFuturesError] = useState<string | null>(null)
  const [slip, setSlip] = useState<Selection[]>([])
  const [mode, setMode] = useState<SlipMode>('single')
  const [rrSizes, setRrSizes] = useState<number[]>([2]) // round-robin combination sizes
  const [stake, setStake] = useState(1000) // cents ($10.00)
  const [sport, setSport] = useState<string>('All') // top browse tier
  const [league, setLeague] = useState<string>('All') // refinement within a sport
  const [error, setError] = useState<string | null>(null)
  const [slipOpen, setSlipOpen] = useState(false) // mobile bet-slip drawer
  const dockRef = useRef<HTMLDivElement>(null) // the mobile sheet, for focus mgmt

  // Odds-format preference, loaded from + saved to localStorage (persistence module).
  const prefRef = useRef<Doc<OddsFormat>>()
  if (!prefRef.current) {
    prefRef.current = persistedDoc<OddsFormat>(createLocalStore({ namespace: 'dimebag' }), 'oddsFormat', {
      version: 1,
      initial: 'american',
    })
  }
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>(() => prefRef.current!.load())
  function changeOddsFormat(f: OddsFormat) {
    setOddsFormat(f)
    prefRef.current!.save(f)
  }

  const available = availableToWager(account)
  const slipIds = useMemo(() => new Set(slip.map((s) => s.id)), [slip])
  const statusById = useMemo(() => new Map(events.map((e) => [e.id, e.status])), [events])

  // Slip legs re-quoted to current live prices; the source of truth for the slip.
  const freshSlip = useMemo(() => slip.map((s) => freshLeg(s, events)), [slip, events])
  // A leg whose market is no longer open (pre-game game started, or live game ended).
  const closedLegs = freshSlip.filter((s) => !placeableNow(s, statusById))
  // A leg the book has suspended since it was added — can't be placed until restored.
  const suspendedLegs = freshSlip.filter((s) => s.suspended)
  // §4 acceptance: a PRE-GAME leg whose posted price moved since it was added — the
  // book shifted the line or re-vigged it. The player must accept the new price
  // before placing (no silent re-quote). Live legs are expected to drift, so they're
  // excluded; they re-quote on their own. Aligned by index (freshSlip = slip mapped).
  const movedIds = useMemo(() => {
    const ids = new Set<string>()
    freshSlip.forEach((s, i) => {
      const orig = slip[i]
      if (orig && !s.live && (s.odds !== orig.odds || s.line !== orig.line)) ids.add(s.id)
    })
    return ids
  }, [freshSlip, slip])
  const linesMoved = movedIds.size > 0
  // The most a single wager may be (credit limit, capped by any per-head max bet).
  const perBetMax = maxBet(account)
  const related = hasRelatedLegs(freshSlip)

  // Which bet types the slip supports, via the bets/ module (single ≥1, parlay ≥2
  // unrelated, round robin ≥3 unrelated). Teaser is gated until the engine carries it.
  const slipSels = useMemo(() => freshSlip.map(toSlipSelection), [freshSlip])
  const betTypes = useMemo(() => availableBetTypes({ selections: slipSels }), [slipSels])
  const availableModes = (['single', 'parlay', 'roundRobin', 'sameGameParlay'] as SlipMode[]).filter(
    (m) => betTypes.includes(m),
  )
  const effectiveMode: SlipMode = availableModes.includes(mode) ? mode : 'single'

  // Round-robin combination sizes, kept inside the valid 2..n−1 band as legs change.
  const rrValidSizes = roundRobinSizes(freshSlip.length)
  const activeRrSizes = (() => {
    const kept = rrSizes.filter((s) => rrValidSizes.includes(s))
    return kept.length ? kept : rrValidSizes.slice(0, 1) // default to the smallest size
  })()

  const { totalStake, totalReturn, parlayCount } = useMemo(() => {
    if (freshSlip.length === 0) return { totalStake: 0, totalReturn: 0, parlayCount: 0 }
    if (effectiveMode === 'parlay' || effectiveMode === 'sameGameParlay') {
      // Same-game parlay prices identically to a parlay — the legs just share a game.
      const dec = priceTicket('parlay', freshSlip)
      return { totalStake: stake, totalReturn: potentialReturn(stake, dec), parlayCount: 1 }
    }
    if (effectiveMode === 'roundRobin' && activeRrSizes.length > 0) {
      const rr = priceRoundRobin({ selections: slipSels }, activeRrSizes, stake)
      return { totalStake: rr.totalStake, totalReturn: rr.maxReturn, parlayCount: rr.parlayCount }
    }
    const ret = freshSlip.reduce((sum, s) => sum + potentialReturn(stake, priceTicket('single', [s])), 0)
    return { totalStake: stake * freshSlip.length, totalReturn: ret, parlayCount: freshSlip.length }
  }, [freshSlip, slipSels, effectiveMode, stake, activeRrSizes.join(',')])

  // Browse drill-down: filter by sport, then (when a sport has several leagues)
  // refine by league. The leagues offered are scoped to the chosen sport.
  const sportLeagues = sport === 'All' ? [] : leaguesInSport(sport)
  const shownEvents = events.filter(
    (e) =>
      (sport === 'All' || e.sport === sport) && (league === 'All' || e.league === league),
  )
  /** Pick a sport — resets the league refinement (its leagues just changed). */
  function chooseSport(s: string) {
    setSport(s)
    setLeague('All')
  }

  // Price movement (the ▲/▼ flash) is detected inside <OddsTick> from the value
  // it's handed each render — no slate-wide bookkeeping needed here.

  // The mobile sheet (slipOpen) is only ever opened on mobile, so these guards
  // are inert on desktop where slipOpen stays false.
  // 1) Don't strand an empty, dimmed sheet open after the last leg is removed.
  useEffect(() => {
    if (freshSlip.length === 0) setSlipOpen(false)
  }, [freshSlip.length])
  // 2) Move focus into the sheet when it opens (entry point for keyboard/AT).
  useEffect(() => {
    if (slipOpen) dockRef.current?.focus()
  }, [slipOpen])
  // 3) Escape closes the open sheet.
  useEffect(() => {
    if (!slipOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSlipOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slipOpen])

  function toggle(sel: Selection) {
    if (sel.suspended) return // the book has pulled this market
    setError(null)
    setSlip((cur) =>
      cur.some((s) => s.id === sel.id)
        ? cur.filter((s) => s.id !== sel.id)
        : [...cur.filter((s) => !(s.eventId === sel.eventId && s.market === sel.market)), sel],
    )
  }

  /** §4 acceptance: lock the slip to the book's current prices, accepting any leg
   *  whose line moved since it was added. */
  function acceptMoves() {
    setSlip(freshSlip)
    setError(null)
  }

  function place() {
    if (slip.length === 0 || totalStake === 0) return
    if (closedLegs.length > 0) {
      setError('Some picks are no longer open — remove them to place your bet.')
      return
    }
    if (suspendedLegs.length > 0) {
      setError('The book has suspended a pick on your slip — remove it to place your bet.')
      return
    }
    if (linesMoved) {
      setError('A price moved — review and accept the new line to place your bet.')
      return
    }
    if (stake > perBetMax) {
      setError(`Each wager is capped at the max bet (${formatMoney(perBetMax)}).`)
      return
    }
    // Honour the player's own responsible-play limits (per-bet cap + a backstop for
    // the session/cooldown blocks the gate already enforces around this screen).
    const rp = checkPlay(account.id, Date.now(), stake)
    if (!rp.allowed) {
      setError(rp.reason ?? 'This bet is over your responsible-play limit.')
      return
    }
    if (totalStake > available) {
      setError(`Total stake exceeds what you can wager (${formatMoney(available)}).`)
      return
    }
    try {
      let reqs: PlaceTicketOptions[]
      if (effectiveMode === 'parlay') {
        reqs = [{ kind: 'parlay', legs: freshSlip, stake }]
      } else if (effectiveMode === 'sameGameParlay') {
        // A bet builder on one game — same parlay path, with the related-leg block
        // opted out of for this deliberately-combined ticket.
        reqs = [{ kind: 'parlay', legs: freshSlip, stake, sameGameParlay: true }]
      } else if (effectiveMode === 'roundRobin') {
        // Every N-leg combination is its own parlay ticket — they settle
        // independently, so a single losing leg only kills the parlays it sits in.
        reqs = []
        for (const size of activeRrSizes) {
          for (const combo of combinations(freshSlip.length, size)) {
            reqs.push({ kind: 'parlay', legs: combo.map((i) => freshSlip[i]), stake })
          }
        }
      } else {
        reqs = freshSlip.map((s) => ({ kind: 'single', legs: [s], stake }))
      }
      store.place(reqs)
      setSlip([])
      setError(null)
      setSlipOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const open = tickets.filter((t) => t.status === 'open')
  const settled = tickets.filter((t) => t.status !== 'open')
  // Live cash-out values, recomputed each feed tick as scores move.
  const cashouts = useMemo(
    () => new Map(open.map((t) => [t.id, store.cashOutValueOf(t.id)])),
    [open, events, store],
  )

  function cashOut(id: string) {
    store.cashOut(id)
  }

  /** Back a futures outcome through the store/core. Returns an error string (also
   *  surfaced in the futures board) or null on success. */
  function placeFuture(marketId: string, outcomeId: string, stake: number): string | null {
    try {
      store.placeFuture(marketId, outcomeId, stake)
      setFuturesError(null)
      return null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setFuturesError(msg)
      return msg
    }
  }

  // First load (no confirmed slate yet) vs degraded-with-cached-data — different
  // UI: a skeleton / a "can't reach" panel when we've never had prices, vs a
  // banner over the held prices when a live feed merely dropped.
  const firstLoad = health.lastUpdated == null
  const connecting = health.status === 'connecting' && firstLoad
  const failedFirstLoad = health.status === 'error' && firstLoad
  const degraded = (health.status === 'reconnecting' || health.status === 'error') && !firstLoad

  return (
    <OddsFormatContext.Provider value={oddsFormat}>
    <div className="sb">
      <div className="sb-main">
        <div className="lobby-head sb-head">
          <div>
            <h1 className="lobby-title">Sportsbook</h1>
            <p className="lobby-sub">
              Live slate — moneyline, spreads & totals. One balance across the whole app.
            </p>
          </div>
          {/* TODO(api): `health` (and the `events` slate below) come from the store's
              feed — the mock feed today (createMockFeed), a real odds/scores API later.
              Both drive the same FeedHealth/GameEvent shapes, so this chip is unchanged
              when the live API is attached. */}
          <FeedStatus health={health} />
        </div>

        <div className="sb-toolbar">
          <div className="sb-tabs" role="group" aria-label="Sportsbook section">
            {(['games', 'futures'] as const).map((t) => (
              <button
                key={t}
                className={`chip ${tab === t ? 'is-on' : ''}`}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {t === 'games' ? 'Games' : 'Futures'}
              </button>
            ))}
          </div>
          {tab === 'games' && (
            <div className="sb-sports" role="group" aria-label="Sport">
              {['All', ...SPORTS].map((s) => (
                <button
                  key={s}
                  className={`chip ${sport === s ? 'is-on' : ''}`}
                  aria-pressed={sport === s}
                  onClick={() => chooseSport(s)}
                >
                  {s === 'All' ? 'All sports' : s}
                </button>
              ))}
            </div>
          )}
          <div className="sb-oddsfmt" role="group" aria-label="Odds format">
            {(['american', 'decimal'] as OddsFormat[]).map((f) => (
              <button
                key={f}
                className={`chip ${oddsFormat === f ? 'is-on' : ''}`}
                onClick={() => changeOddsFormat(f)}
              >
                {f === 'american' ? 'American' : 'Decimal'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'games' && sportLeagues.length >= 2 && (
          <div className="sb-leagues" role="group" aria-label={`${sport} leagues`}>
            {['All', ...sportLeagues].map((l) => (
              <button
                key={l}
                className={`chip chip-sm ${league === l ? 'is-on' : ''}`}
                aria-pressed={league === l}
                onClick={() => setLeague(l)}
              >
                {l === 'All' ? `All ${sport}` : l}
              </button>
            ))}
          </div>
        )}

        {degraded && (
          <div className="sb-feedbanner" role="status">
            {health.status === 'reconnecting'
              ? 'Reconnecting to the live feed — showing the last prices.'
              : 'The live feed dropped — showing the last prices while we reconnect.'}
          </div>
        )}

        {tab === 'futures' ? (
          <FuturesBoard markets={futures} available={available} error={futuresError} onPlace={placeFuture} />
        ) : connecting ? (
          <BoardSkeleton />
        ) : failedFirstLoad ? (
          <div className="sb-empty" role="status">
            <p className="sb-empty-title">Can’t reach the live feed</p>
            <p className="sb-empty-sub">We’re retrying — the board will load as soon as it’s back.</p>
          </div>
        ) : (
        <div className="sb-board">
          {shownEvents.length === 0 ? (
            <div className="sb-empty">
              <p className="sb-empty-title">No games on the board</p>
              <p className="sb-empty-sub">
                {sport === 'All' && league === 'All'
                  ? 'The slate is between cycles — games will be back on the board shortly.'
                  : `No ${league !== 'All' ? league : sport} games right now. Try another ${
                      league !== 'All' ? 'league' : 'sport'
                    }.`}
              </p>
            </div>
          ) : (
            <>
              <EventGroup
                title="Live now"
                tone="live"
                events={shownEvents.filter((e) => e.status === 'live')}
                slipIds={slipIds}
                onPick={toggle}
              />
              <EventGroup
                title="Upcoming"
                events={shownEvents.filter((e) => e.status === 'upcoming')}
                slipIds={slipIds}
                onPick={toggle}
              />
              <EventGroup
                title="Final"
                tone="final"
                events={shownEvents.filter((e) => e.status === 'final')}
                slipIds={slipIds}
                onPick={toggle}
              />
            </>
          )}
        </div>
        )}

        <Rules points={SPORTSBOOK_RULES} />
      </div>

      <aside className={`sb-aside ${slipOpen ? 'is-slip-open' : ''}`}>
        <div
          className="sb-slip-dock"
          ref={dockRef}
          tabIndex={-1}
          role={slipOpen ? 'dialog' : undefined}
          aria-modal={slipOpen ? true : undefined}
          aria-label={slipOpen ? 'Bet slip' : undefined}
        >
          <BetSlip
            slip={freshSlip}
            mode={effectiveMode}
            availableModes={availableModes}
            related={related}
            closedLegs={closedLegs}
            stake={stake}
            available={available}
            totalStake={totalStake}
            totalReturn={totalReturn}
            parlayCount={parlayCount}
            rrSizes={activeRrSizes}
            rrValidSizes={rrValidSizes}
            movedIds={movedIds}
            error={error}
            onMode={setMode}
            onStake={setStake}
            onAccept={acceptMoves}
            onToggleRrSize={(k) =>
              setRrSizes(() => {
                const has = activeRrSizes.includes(k)
                if (has && activeRrSizes.length === 1) return activeRrSizes // keep ≥1 size
                return has ? activeRrSizes.filter((x) => x !== k) : [...activeRrSizes, k]
              })
            }
            onRemove={(id) => setSlip((c) => c.filter((s) => s.id !== id))}
            onClear={() => {
              setSlip([])
              setError(null)
              setSlipOpen(false)
            }}
            onPlace={place}
            onClose={() => setSlipOpen(false)}
          />
        </div>

        <MyBets
          open={open}
          settled={settled}
          futureTickets={futureTickets}
          cashouts={cashouts}
          onCashOut={cashOut}
        />
      </aside>
    </div>

      {/* Mobile-only: a sticky summary bar that opens the slip as a bottom sheet,
          plus a backdrop to dismiss it. Both are hidden on desktop, where the
          aside slip is always visible. */}
      {freshSlip.length > 0 && !slipOpen && (
        <button className="sb-mobilebar" onClick={() => setSlipOpen(true)}>
          <span className="sb-mobilebar-count">
            {freshSlip.length} {freshSlip.length === 1 ? 'pick' : 'picks'}
          </span>
          <span className="sb-mobilebar-cta">View slip · {formatMoney(totalReturn)}</span>
        </button>
      )}
      {slipOpen && <div className="sb-backdrop" aria-hidden="true" onClick={() => setSlipOpen(false)} />}
    </OddsFormatContext.Provider>
  )
}

/* ------------------------------ feed status ------------------------------ */
// The feed-status chip is now <FeedStatus> from ./live — the single source of
// truth for the live indicator (status label, dot, and per-second freshness).

/** Placeholder board shown while the feed makes its first connection. */
function BoardSkeleton() {
  return (
    <div className="sb-board" aria-hidden="true">
      <div className="sb-group">
        <div className="sb-group-head">
          <span className="sb-skel-pill" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="sb-event sb-skel-card">
            <div className="sb-skel-line sb-skel-teams" />
            <div className="sb-skel-prices">
              {[0, 1, 2, 3, 4, 5].map((j) => (
                <span key={j} className="sb-skel-cell" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------ event group ------------------------------ */

/** A titled run of events sharing a status (Live now / Upcoming / Final). The
 *  board groups by the feed's `status`, so as a game goes live or finals it
 *  visibly moves between groups — the same status a real API will drive. Renders
 *  nothing when its group is empty, so headers never sit over a blank slate. */
function EventGroup({
  title,
  tone,
  events,
  slipIds,
  onPick,
}: {
  title: string
  tone?: 'live' | 'final'
  events: GameEvent[]
  slipIds: Set<string>
  onPick: (s: Selection) => void
}) {
  if (events.length === 0) return null
  return (
    <section className="sb-group">
      <header className={`sb-group-head ${tone ? `is-${tone}` : ''}`}>
        {tone === 'live' && <span className="sb-live-dot" />}
        <h2 className="sb-group-title">{title}</h2>
        <span className="sb-group-count">{events.length}</span>
      </header>
      <div className="sb-events">
        {events.map((e) => (
          <EventCard key={e.id} event={e} slipIds={slipIds} onPick={onPick} />
        ))}
      </div>
    </section>
  )
}

/* ------------------------------- event card ------------------------------ */

function EventCard({
  event,
  slipIds,
  onPick,
}: {
  event: GameEvent
  slipIds: Set<string>
  onPick: (s: Selection) => void
}) {
  const fmtOdds = useFmtOdds()
  const byMarket = (m: MarketKind) => event.selections.filter((s) => s.market === m)
  const open = event.status === 'upcoming'
  // The book has pulled every market on this game (a manager suspended the event).
  const allSuspended = open && event.selections.every((s) => s.suspended)

  return (
    <section className={`sb-event is-${event.status}`}>
      <header className="sb-event-head">
        <div className="sb-teams">
          <span className="sb-team">{event.away}</span>
          <span className="sb-at">@</span>
          <span className="sb-team">{event.home}</span>
        </div>
        <div className="sb-meta">
          <span className="sb-league">{event.league}</span>
          {allSuspended && <span className="sb-suspended-pill">Suspended</span>}
          <LiveBadge event={event} />
          <LiveScore event={event} />
        </div>
      </header>

      {open ? (
        <div className="sb-markets">
          {(['moneyline', 'spread', 'total'] as MarketKind[]).map((m) => (
            <div key={m} className="sb-market">
              <span className="sb-market-label">{MARKET_LABELS[m]}</span>
              <div className="sb-prices">
                {byMarket(m).map((s) => (
                  <button
                    key={s.id}
                    className={`sb-price ${slipIds.has(s.id) ? 'is-on' : ''} ${
                      s.suspended ? 'is-suspended' : ''
                    }`}
                    disabled={s.suspended}
                    onClick={() => onPick(s)}
                  >
                    <span className="sb-price-label">{s.label}</span>
                    {s.suspended ? (
                      <span className="sb-price-odds sb-price-lock" aria-label="suspended">
                        ✕
                      </span>
                    ) : (
                      <span className="sb-price-odds">{fmtOdds(s.odds)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : event.status === 'live' ? (
        <div className="sb-livepanel">
          <LiveWinBar event={event} />
          {(() => {
            const live = liveSelections(event)
            const byMkt = (m: MarketKind) => live.filter((s) => s.market === m)
            return (['moneyline', 'spread', 'total'] as MarketKind[]).map((m) => (
              <div key={m} className="sb-market">
                <span className="sb-market-label">
                  {m === 'moneyline' && (
                    <span className="sb-live-tag">
                      <span className="sb-live-dot" /> Live
                    </span>
                  )}
                  {MARKET_LABELS[m]}
                </span>
                <div className="sb-prices">
                  {byMkt(m).map((s) => (
                    <button
                      key={s.id}
                      className={`sb-price sb-price-live ${slipIds.has(s.id) ? 'is-on' : ''}`}
                      onClick={() => onPick(s)}
                    >
                      <span className="sb-price-label">{s.label}</span>
                      {/* OddsTick flashes ▲/▼ when the in-play price moves between feed ticks. */}
                      <OddsTick value={s.odds} format={fmtOdds} />
                    </button>
                  ))}
                </div>
              </div>
            ))
          })()}
        </div>
      ) : (
        <p className="sb-closed-note">Final.</p>
      )}
    </section>
  )
}

/** DimeBag's live win-probability bar — the scoreboard's read on the game. */
function LiveWinBar({ event }: { event: GameEvent }) {
  const homeSel = event.selections.find((s) => s.market === 'moneyline' && s.pick === 'home')
  const awaySel = event.selections.find((s) => s.market === 'moneyline' && s.pick === 'away')
  if (!homeSel || !awaySel) return null

  const ph = liveWinProb(homeSel, event)
  const pa = liveWinProb(awaySel, event)
  const homePct = Math.round((ph / (ph + pa)) * 100)
  const awayPct = 100 - homePct

  return (
    <div className="sb-winbar">
      <div className="sb-winbar-head">
        <span>
          {event.away} <strong>{awayPct}%</strong>
        </span>
        <span className="sb-winbar-title">Win probability</span>
        <span>
          <strong>{homePct}%</strong> {event.home}
        </span>
      </div>
      <div className="sb-winbar-track">
        <span className="sb-winbar-away" style={{ width: `${awayPct}%` }} />
        <span className="sb-winbar-home" style={{ width: `${homePct}%` }} />
      </div>
    </div>
  )
}

/* -------------------------------- bet slip ------------------------------- */

function BetSlip({
  slip,
  mode,
  availableModes,
  related,
  closedLegs,
  stake,
  available,
  totalStake,
  totalReturn,
  parlayCount,
  rrSizes,
  rrValidSizes,
  movedIds,
  error,
  onMode,
  onStake,
  onToggleRrSize,
  onRemove,
  onClear,
  onPlace,
  onAccept,
  onClose,
}: {
  slip: Selection[]
  mode: SlipMode
  availableModes: SlipMode[]
  related: boolean
  closedLegs: Selection[]
  stake: number
  available: number
  totalStake: number
  totalReturn: number
  /** How many tickets this slip will place (round robin spreads across many). */
  parlayCount: number
  rrSizes: number[]
  rrValidSizes: number[]
  /** Legs whose posted price moved since they were added (§4 — must be accepted). */
  movedIds: Set<string>
  error: string | null
  onMode: (m: SlipMode) => void
  onStake: (n: number) => void
  onToggleRrSize: (k: number) => void
  onRemove: (id: string) => void
  onClear: () => void
  onPlace: () => void
  /** Accept any moved prices (§4 acceptance), re-locking the slip to the live line. */
  onAccept: () => void
  /** Dismiss the mobile bottom-sheet (rendered as a ✕, mobile only). */
  onClose?: () => void
}) {
  const fmtOdds = useFmtOdds()
  const profit = totalReturn - totalStake
  const closedIds = new Set(closedLegs.map((s) => s.id))
  const linesMoved = movedIds.size > 0
  const stakeLabel =
    mode === 'parlay' || mode === 'sameGameParlay'
      ? 'Parlay stake'
      : mode === 'roundRobin'
        ? 'Stake (per parlay)'
        : 'Stake (each)'
  const placeLabel =
    mode === 'parlay'
      ? 'Place parlay'
      : mode === 'sameGameParlay'
        ? 'Place same game parlay'
        : mode === 'roundRobin'
          ? `Place ${parlayCount} parlays`
          : slip.length > 1
            ? `Place ${slip.length} bets`
            : 'Place bet'
  return (
    <section className="sb-slip">
      <header className="sb-slip-head">
        <span className="sb-slip-title">Bet slip</span>
        <div className="sb-slip-head-actions">
          {slip.length > 0 && (
            <button className="sb-clear" onClick={onClear}>
              Clear
            </button>
          )}
          {onClose && (
            <button className="sb-slip-close" onClick={onClose} aria-label="Close bet slip">
              ×
            </button>
          )}
        </div>
      </header>

      {slip.length === 0 ? (
        <p className="sb-slip-empty">Tap a price to start a bet.</p>
      ) : (
        <>
          {availableModes.length > 1 && (
            <div className="sb-mode">
              {availableModes.map((m) => (
                <button
                  key={m}
                  className={`chip ${mode === m ? 'is-on' : ''}`}
                  onClick={() => onMode(m)}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          )}
          {related && slip.length >= 2 && mode !== 'sameGameParlay' && (
            <p className="sb-note">
              {availableModes.includes('sameGameParlay') ? (
                <>
                  All picks are on one game — pick{' '}
                  <Term id="same-game-parlay">Same Game</Term> to combine them into one bet, or bet
                  as singles.
                </>
              ) : (
                'Two picks from one game can’t be combined with the rest — betting as singles.'
              )}
            </p>
          )}

          {mode === 'roundRobin' && (
            <div className="sb-rr">
              <div className="sb-rr-sizes" role="group" aria-label="Round robin combination sizes">
                {rrValidSizes.map((k) => (
                  <button
                    key={k}
                    className={`chip ${rrSizes.includes(k) ? 'is-on' : ''}`}
                    onClick={() => onToggleRrSize(k)}
                  >
                    By {k}s
                  </button>
                ))}
              </div>
              <p className="sb-rr-note">
                {parlayCount} parlays · every {rrSizes.join(' & ')}-leg combo of your {slip.length} picks
              </p>
            </div>
          )}

          <ul className="sb-legs">
            {slip.map((s) => (
              <li
                key={s.id}
                className={`sb-leg ${closedIds.has(s.id) ? 'is-closed' : ''} ${
                  movedIds.has(s.id) ? 'is-moved' : ''
                }`}
              >
                <div className="sb-leg-main">
                  <span className="sb-leg-label">
                    {s.label}
                    {s.live && !closedIds.has(s.id) && <span className="sb-leg-live">live</span>}
                    {closedIds.has(s.id) && <span className="sb-leg-closed">closed</span>}
                    {movedIds.has(s.id) && <span className="sb-leg-moved">moved</span>}
                  </span>
                  <span className="sb-leg-odds">{fmtOdds(s.odds)}</span>
                </div>
                <button className="sb-leg-x" onClick={() => onRemove(s.id)} aria-label="remove">
                  ×
                </button>
              </li>
            ))}
          </ul>

          <label className="field sb-stake">
            <span className="field-label">{stakeLabel}</span>
            <div className="field-bet">
              <span className="field-prefix">$</span>
              <input
                className="field-input"
                type="number"
                min={0.01}
                step={0.01}
                value={stake / 100}
                onChange={(e) => onStake(Math.max(1, toCents(Number(e.target.value))))}
              />
            </div>
          </label>

          <div className="sb-quickstake">
            {[500, 2500, 10000].map((c) => (
              <button key={c} className="chip" onClick={() => onStake(c)}>
                ${c / 100}
              </button>
            ))}
            <button className="chip" onClick={() => onStake(Math.max(1, Math.round(stake / 2)))}>
              ½
            </button>
            <button className="chip" onClick={() => onStake(stake * 2)}>
              2×
            </button>
          </div>

          <dl className="sb-summary">
            <div>
              <dt>Total stake</dt>
              <dd>{formatMoney(totalStake)}</dd>
            </div>
            <div className="sb-summary-pay">
              <dt>
                <Term id="payout">To return</Term>
              </dt>
              <dd>{formatMoney(totalReturn)}</dd>
            </div>
            <div className="sb-summary-profit">
              <dt>Profit</dt>
              <dd>{formatMoney(profit)}</dd>
            </div>
          </dl>

          {linesMoved && (
            <p className="sb-note sb-moved-note">
              A price moved since you added it — accept the new line to place at the current price.
            </p>
          )}
          {error && <p className="sb-error">{error}</p>}

          {linesMoved ? (
            <button className="action action-accept" onClick={onAccept}>
              Accept new prices
            </button>
          ) : (
            <button
              className="action action-bet"
              onClick={onPlace}
              disabled={totalStake === 0 || totalStake > available || closedLegs.length > 0}
            >
              {placeLabel}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/* -------------------------------- futures -------------------------------- */

function FuturesBoard({
  markets,
  available,
  error,
  onPlace,
}: {
  markets: FutureMarket[]
  available: number
  error: string | null
  onPlace: (marketId: string, outcomeId: string, stake: number) => string | null
}) {
  const fmtOdds = useFmtOdds()
  const [pick, setPick] = useState<{
    marketId: string
    outcomeId: string
    label: string
    marketName: string
    decimal: number
  } | null>(null)
  const [stake, setStake] = useState(1000)
  const [localError, setLocalError] = useState<string | null>(null)

  function choose(market: FutureMarket, outcomeId: string, label: string, decimal: number) {
    setLocalError(null)
    setPick({ marketId: market.id, outcomeId, label, marketName: market.name, decimal })
  }
  function submit() {
    if (!pick) return
    const err = onPlace(pick.marketId, pick.outcomeId, stake)
    if (err) setLocalError(err)
    else {
      setPick(null)
      setLocalError(null)
    }
  }

  if (markets.length === 0) {
    return (
      <div className="sb-empty">
        <p className="sb-empty-title">No futures on the board</p>
        <p className="sb-empty-sub">Outright markets will appear here.</p>
      </div>
    )
  }

  const ret = pick ? potentialReturn(stake, pick.decimal) : 0
  const overStake = stake > available

  return (
    <div className="sb-board sb-futures">
      {markets.map((m) => (
        <FutureMarketCard key={m.id} market={m} fmtOdds={fmtOdds} pick={pick} onChoose={choose} />
      ))}

      {pick && (
        <div className="sb-futbar" role="form" aria-label="Place a futures bet">
          <div className="sb-futbar-pick">
            <span className="sb-futbar-out">{pick.label}</span>
            <span className="sb-futbar-mkt">{pick.marketName}</span>
          </div>
          <label className="sb-futbar-stake">
            <span className="field-prefix">$</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              aria-label="Futures stake"
              value={stake / 100}
              onChange={(e) => setStake(Math.max(0, toCents(Number(e.target.value) || 0)))}
            />
          </label>
          <span className="sb-futbar-ret">
            Returns <b>{formatMoney(ret)}</b>
          </span>
          <button
            type="button"
            className="action action-bet sb-futbar-place"
            disabled={stake <= 0 || overStake}
            onClick={submit}
          >
            Place
          </button>
        </div>
      )}
      {(localError ?? error) && <p className="sb-error sb-fut-error">{localError ?? error}</p>}
    </div>
  )
}

function FutureMarketCard({
  market,
  fmtOdds,
  pick,
  onChoose,
}: {
  market: FutureMarket
  fmtOdds: (a: number) => string
  pick: { marketId: string; outcomeId: string } | null
  onChoose: (market: FutureMarket, outcomeId: string, label: string, decimal: number) => void
}) {
  const settled = market.status === 'settled'
  return (
    <section className={`sb-event sb-futmkt ${settled ? 'is-final' : ''}`}>
      <header className="sb-event-head">
        <div className="sb-teams">
          <span className="sb-team">{market.name}</span>
        </div>
        <div className="sb-meta">
          <span className="sb-league">{market.league}</span>
          {settled ? (
            <span className="sb-fut-settled">Settled</span>
          ) : (
            <span className="sb-fut-book">{(futureOverround(market) * 100).toFixed(0)}% book</span>
          )}
        </div>
      </header>
      <div className="sb-fut-outcomes">
        {market.outcomes.map((o) => {
          const isWinner = settled && market.winnerId === o.id
          const selected = pick?.marketId === market.id && pick?.outcomeId === o.id
          return (
            <button
              key={o.id}
              type="button"
              className={`sb-fut-out ${selected ? 'is-on' : ''} ${isWinner ? 'is-winner' : ''}`}
              disabled={settled}
              onClick={() => onChoose(market, o.id, o.label, futureDecimal(o))}
            >
              <span className="sb-fut-out-label">{o.label}</span>
              <span className="sb-price-odds">
                {settled ? (isWinner ? 'Winner ✓' : '—') : fmtOdds(o.american)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* --------------------------------- my bets ------------------------------- */

function MyBets({
  open,
  settled,
  futureTickets,
  cashouts,
  onCashOut,
}: {
  open: Ticket[]
  settled: Ticket[]
  futureTickets: FutureTicket[]
  cashouts: Map<string, number>
  onCashOut: (id: string) => void
}) {
  const openF = futureTickets.filter((t) => t.status === 'open')
  const settledF = futureTickets.filter((t) => t.status !== 'open')
  if (open.length === 0 && settled.length === 0 && futureTickets.length === 0) return null

  // Running accounting across game + futures bets: record + net P&L, plus what's
  // still at risk in open bets.
  const atRisk =
    open.reduce((sum, t) => sum + t.stake, 0) + openF.reduce((sum, t) => sum + t.stake, 0)
  const net =
    settled.reduce((sum, t) => sum + ((t.returned ?? 0) - t.stake), 0) +
    settledF.reduce((sum, t) => sum + ((t.returned ?? 0) - t.stake), 0)
  const won =
    settled.filter((t) => (t.returned ?? 0) > t.stake).length +
    settledF.filter((t) => t.status === 'won').length
  const lost =
    settled.filter((t) => (t.returned ?? 0) < t.stake).length +
    settledF.filter((t) => t.status === 'lost').length
  const openCount = open.length + openF.length
  const settledCount = settled.length + settledF.length

  return (
    <section className="sb-mybets">
      <header className="sb-mybets-head">
        <span className="sb-slip-title">My bets</span>
        {openCount > 0 && <span className="sb-open-count">{openCount} open</span>}
      </header>

      <dl className="sb-betstats">
        <div>
          <dt>At risk</dt>
          <dd>{formatMoney(atRisk)}</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd>{settledCount === 0 ? '—' : `${won}–${lost}`}</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd className={net > 0 ? 'is-up' : net < 0 ? 'is-down' : ''}>
            {net > 0 ? '+' : ''}
            {formatMoney(net)}
          </dd>
        </div>
      </dl>

      {(open.length > 0 || openF.length > 0) && (
        <ul className="sb-tickets">
          {open.map((t) => (
            <TicketRow key={t.id} ticket={t} cashout={cashouts.get(t.id) ?? 0} onCashOut={onCashOut} />
          ))}
          {openF.map((t) => (
            <FutureTicketRow key={t.id} ticket={t} />
          ))}
        </ul>
      )}

      {(settled.length > 0 || settledF.length > 0) && (
        <>
          <p className="sb-settled-label">Settled</p>
          <ul className="sb-tickets">
            {settled.map((t) => (
              <TicketRow key={t.id} ticket={t} />
            ))}
            {settledF.map((t) => (
              <FutureTicketRow key={t.id} ticket={t} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** A futures bet in My Bets — mirrors a single game ticket's layout. */
function FutureTicketRow({ ticket }: { ticket: FutureTicket }) {
  const fmtOdds = useFmtOdds()
  const odds = americanFromDecimal(ticket.oddsDecimal)
  return (
    <li className={`sb-ticket is-${ticket.status}`}>
      <div className="sb-ticket-top">
        <span className="sb-ticket-kind">Future · {fmtOdds(odds)}</span>
        <span className={`sb-ticket-status is-${ticket.status}`}>
          {{ open: 'Open', won: 'Won', lost: 'Lost', void: 'Void' }[ticket.status]}
        </span>
      </div>
      <ul className="sb-ticket-legs">
        <li className={ticket.status === 'open' ? '' : `leg-${ticket.status === 'won' ? 'win' : ticket.status}`}>
          {ticket.outcomeLabel}
          <span className="sb-ticket-leg-odds">{ticket.marketName}</span>
        </li>
      </ul>
      <div className="sb-ticket-foot">
        <span>Stake {formatMoney(ticket.stake)}</span>
        <span>
          {ticket.status === 'open'
            ? `To return ${formatMoney(potentialReturn(ticket.stake, ticket.oddsDecimal))}`
            : ticket.status === 'won'
              ? `Returned ${formatMoney(ticket.returned ?? 0)}`
              : ticket.status === 'void'
                ? 'Stake returned'
                : `Lost ${formatMoney(ticket.stake)}`}
        </span>
      </div>
    </li>
  )
}

function TicketRow({
  ticket,
  cashout = 0,
  onCashOut,
}: {
  ticket: Ticket
  cashout?: number
  onCashOut?: (id: string) => void
}) {
  const fmtOdds = useFmtOdds()
  const odds = americanFromDecimal(ticket.oddsDecimal)
  const canCashOut = ticket.status === 'open' && cashout > 0 && onCashOut != null
  return (
    <li className={`sb-ticket is-${ticket.status}`}>
      <div className="sb-ticket-top">
        <span className="sb-ticket-kind">
          {ticket.kind === 'parlay' ? `${ticket.legs.length}-leg parlay` : 'Single'} ·{' '}
          {fmtOdds(odds)}
        </span>
        <span className={`sb-ticket-status is-${ticket.status}`}>{statusLabel(ticket.status)}</span>
      </div>
      <ul className="sb-ticket-legs">
        {ticket.legs.map((l, i) => (
          <li key={l.id} className={ticket.legOutcomes ? `leg-${ticket.legOutcomes[i]}` : ''}>
            {l.label} <span className="sb-ticket-leg-odds">{fmtOdds(l.odds)}</span>
          </li>
        ))}
      </ul>
      <div className="sb-ticket-foot">
        <span>Stake {formatMoney(ticket.stake)}</span>
        <span>
          {ticket.status === 'open'
            ? `To return ${formatMoney(potentialReturn(ticket.stake, ticket.oddsDecimal))}`
            : ticket.status === 'won'
              ? `Returned ${formatMoney(ticket.returned ?? 0)}`
              : ticket.status === 'cashed'
                ? `Cashed ${formatMoney(ticket.returned ?? 0)}`
                : ticket.status === 'lost'
                  ? `Lost ${formatMoney(ticket.stake)}`
                  : 'Stake returned'}
        </span>
      </div>
      {canCashOut && (
        <button className="sb-cashout" onClick={() => onCashOut!(ticket.id)}>
          Cash out {formatMoney(cashout)}
        </button>
      )}
    </li>
  )
}

function statusLabel(s: Ticket['status']): string {
  return { open: 'Open', won: 'Won', lost: 'Lost', push: 'Push', void: 'Void', cashed: 'Cashed' }[s]
}
