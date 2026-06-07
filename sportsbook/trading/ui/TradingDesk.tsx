import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  marketReport,
  twoWayPrices,
  pricedOverround,
  exposure,
  suggestLineMove,
  decimalFromAmerican,
  americanFromDecimal,
  expectedValue,
  breakEvenProbability,
  kellyFraction,
  kellyStake,
  isValueBet,
  arbitrage,
  type DevigMethod,
  type MarginMethod,
  type BookPosition,
} from '../index.js'
import {
  formatAmerican,
  EVENTS,
  applyOverlay,
  subscribeOverlay,
  getOverlayVersion,
  getAdjustment,
  isEventSuspended,
  isMarketSuspended,
  isMarketAdjusted,
  setEventSuspended,
  setMarketSuspended,
  nudgeLine,
  setMargin,
  resetMarket,
  type GameEvent,
  type MarketKind,
  type Selection,
} from '../../index.js'
import {
  pricePlayerProp,
  propOverProbability,
  altLineLadder,
  DEFAULT_STAT_SD,
  SAMPLE_PROPS,
  type PlayerProp,
  type StatKey,
} from '../../props/index.js'
import { teaserDecimal, TEASER_TABLES, boostProfit, boostedReturn, freeBetValue, freeBetReturn, type TeaserSport } from '../../bets/index.js'
import { formatMoney, toCents } from '../../../games/shared/money.js'
import './trading-desk.css'

/**
 * The trading desk (CLAUDE.md §4) — the operator's odds toolkit, surfaced in the
 * management console. Every casino game and the player sportsbook settle through
 * the same `core` figure; this view is the other side of the counter: how the
 * book reads a market's vig, posts its own prices, watches exposure, prices props,
 * and works out value, arbs, teasers and promos. Pure tools from
 * `sportsbook/trading`, `/props` and `/bets` — it holds no points and places no
 * bets, it just does the maths a trader does.
 */

type DeskTab = 'lines' | 'markets' | 'props' | 'value' | 'promos'

const TABS: { key: DeskTab; label: string }[] = [
  { key: 'lines', label: 'Lines' },
  { key: 'markets', label: 'Markets' },
  { key: 'props', label: 'Props & lines' },
  { key: 'value', label: 'Value & arbs' },
  { key: 'promos', label: 'Parlays & promos' },
]

const DEVIG_METHODS: { key: DevigMethod; label: string; hint: string }[] = [
  { key: 'proportional', label: 'Proportional', hint: 'margin shared in proportion to each price — the usual default' },
  { key: 'power', label: 'Power', hint: 'corrects the favourite–longshot bias (takes more vig off longshots)' },
  { key: 'shin', label: 'Shin', hint: 'models a fraction of informed money — what sharp books use' },
]

const MARGIN_METHODS: { key: MarginMethod; label: string }[] = [
  { key: 'proportional', label: 'Proportional' },
  { key: 'additive', label: 'Additive' },
  { key: 'power', label: 'Power' },
]

const STAT_LABEL: Record<StatKey, string> = {
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  threes: '3-Pointers',
  pra: 'Pts + Reb + Ast',
  passing_yards: 'Passing yards',
  rushing_yards: 'Rushing yards',
  receiving_yards: 'Receiving yards',
  receptions: 'Receptions',
}

const KELLY_OPTS: { label: string; mult: number }[] = [
  { label: 'Full', mult: 1 },
  { label: 'Half', mult: 0.5 },
  { label: 'Quarter', mult: 0.25 },
]

const BOOST_OPTS: { label: string; pct: number }[] = [
  { label: '+25%', pct: 0.25 },
  { label: '+50%', pct: 0.5 },
  { label: '+100%', pct: 1 },
]

/** A percentage, one decimal place by default (e.g. 0.0476 → "4.8%"). */
function pct(x: number, dp = 1): string {
  return `${(x * 100).toFixed(dp)}%`
}

/** A signed percentage (for EV / edge, where the sign matters). */
function signedPct(x: number, dp = 1): string {
  return `${x > 0 ? '+' : ''}${(x * 100).toFixed(dp)}%`
}

export function TradingDesk() {
  const [tab, setTab] = useState<DeskTab>('lines')
  return (
    <div className="td">
      <header className="td-head">
        <h2 className="td-title">Trading desk</h2>
        <p className="td-sub">
          The book’s side of the counter. <strong>Lines</strong> is live — move a line, set the vig
          or pull a market and it hits the player book at once. The other tabs are tools: read a
          market’s vig, post prices, watch exposure, and price props, parlays and promos.
        </p>
      </header>

      <div className="td-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`td-tab ${tab === t.key ? 'is-on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="td-grid">
        {tab === 'lines' && <LinesCard />}
        {tab === 'markets' && (
          <>
            <DevigCard />
            <PriceMakerCard />
            <ExposureCard />
          </>
        )}
        {tab === 'props' && <PropCard />}
        {tab === 'value' && (
          <>
            <EdgeKellyCard />
            <ArbitrageCard />
          </>
        )}
        {tab === 'promos' && (
          <>
            <TeaserCard />
            <BoostCard />
          </>
        )}
      </div>
    </div>
  )
}

/* ----------------------------- line management --------------------------- */

const MARKET_LABEL: Record<MarketKind, string> = {
  moneyline: 'Moneyline',
  spread: 'Spread',
  total: 'Total',
}
/** The vig presets a manager can post a market at (the rest is the feed price). */
const VIG_PRESETS = [0.02, 0.045, 0.06]
const sgnNum = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/** Short side label for a price chip in the grid. */
function pickLabel(s: Selection, e: GameEvent): string {
  if (s.market === 'total') return s.pick === 'over' ? 'Over' : 'Under'
  return s.pick === 'home' ? e.home : e.away
}

/**
 * Live line management — the one part of the desk that MOVES the player book.
 * It reads the same slate players bet (the feed events with the overlay applied)
 * and writes manager adjustments straight back to the overlay, so a move/vig/pull
 * is reflected for every player at once. It manages the pre-game (`upcoming`)
 * book; once a game is live the feed owns it.
 */
function LinesCard() {
  useSyncExternalStore(subscribeOverlay, getOverlayVersion)
  const slate = applyOverlay(EVENTS)
  return (
    <div className="td-card td-lines">
      <h3 className="td-card-title">Line management</h3>
      <p className="td-card-hint">
        Move a line, set the vig, or pull a market — every change hits the player book the moment you
        make it. Bets already placed keep the price they locked (§4 acceptance).
      </p>
      <div className="td-lines-list">
        {slate.map((e) => (
          <EventLines key={e.id} event={e} />
        ))}
      </div>
    </div>
  )
}

function EventLines({ event }: { event: GameEvent }) {
  const suspended = isEventSuspended(event.id)
  return (
    <div className={`td-evt ${suspended ? 'is-suspended' : ''}`}>
      <div className="td-evt-head">
        <div className="td-evt-name">
          <span className="td-evt-league">{event.league}</span>
          <span className="td-evt-teams">
            {event.away} <span className="td-evt-at">@</span> {event.home}
          </span>
          <span className="td-evt-time">{event.startsAt}</span>
        </div>
        <button
          type="button"
          className={`td-pull td-pull-evt ${suspended ? 'is-on' : ''}`}
          onClick={() => setEventSuspended(event.id, !suspended)}
        >
          {suspended ? 'Game suspended' : 'Suspend game'}
        </button>
      </div>
      <div className="td-mkts">
        {(['moneyline', 'spread', 'total'] as MarketKind[]).map((m) => (
          <MarketLine key={m} event={event} market={m} />
        ))}
      </div>
    </div>
  )
}

function MarketLine({ event, market }: { event: GameEvent; market: MarketKind }) {
  const sels = event.selections.filter((s) => s.market === market)
  const adj = getAdjustment(event.id, market)
  const evtSusp = isEventSuspended(event.id)
  const suspended = isMarketSuspended(event.id, market)
  const adjusted = isMarketAdjusted(event.id, market)
  const hasLine = market !== 'moneyline'
  const line = sels[0]?.line ?? 0

  return (
    <div className={`td-mkt ${suspended ? 'is-suspended' : ''}`}>
      <span className="td-mkt-name">
        {MARKET_LABEL[market]}
        {adjusted && <span className="td-mkt-dot" title="Adjusted from the feed" />}
      </span>

      {hasLine ? (
        <span className="td-line-ctl">
          <button
            type="button"
            className="td-step"
            aria-label={`Lower the ${market} line`}
            disabled={evtSusp}
            onClick={() => nudgeLine(event.id, market, -0.5)}
          >
            −
          </button>
          <span className="td-line-val">{market === 'spread' ? sgnNum(line) : line}</span>
          <button
            type="button"
            className="td-step"
            aria-label={`Raise the ${market} line`}
            disabled={evtSusp}
            onClick={() => nudgeLine(event.id, market, 0.5)}
          >
            +
          </button>
        </span>
      ) : (
        <span className="td-line-ctl td-line-na">—</span>
      )}

      <span className="td-prices">
        {sels.map((s) => (
          <span key={s.id} className="td-price">
            <b>{pickLabel(s, event)}</b>
            <span className="td-price-odds">{formatAmerican(s.odds)}</span>
          </span>
        ))}
      </span>

      <span className="td-vig" role="group" aria-label={`${MARKET_LABEL[market]} vig`}>
        {VIG_PRESETS.map((v) => (
          <button
            type="button"
            key={v}
            className={`td-vigbtn ${adj?.margin === v ? 'is-on' : ''}`}
            disabled={evtSusp}
            onClick={() => setMargin(event.id, market, v)}
          >
            {(v * 100).toFixed(1).replace(/\.0$/, '')}%
          </button>
        ))}
        <button
          type="button"
          className={`td-vigbtn ${adj?.margin == null ? 'is-on' : ''}`}
          disabled={evtSusp}
          onClick={() => setMargin(event.id, market, null)}
        >
          Feed
        </button>
      </span>

      <span className="td-mkt-actions">
        <button
          type="button"
          className={`td-pull ${adj?.suspended ? 'is-on' : ''}`}
          disabled={evtSusp}
          onClick={() => setMarketSuspended(event.id, market, !adj?.suspended)}
        >
          {adj?.suspended ? 'Pulled' : 'Pull'}
        </button>
        <button
          type="button"
          className="td-reset"
          disabled={evtSusp || !adjusted}
          aria-label={`Reset the ${MARKET_LABEL[market]}`}
          onClick={() => resetMarket(event.id, market)}
        >
          ↺
        </button>
      </span>
    </div>
  )
}

/* -------------------------------- devig ---------------------------------- */

/** Read a posted market: strip the vig to the book's fair probabilities. */
function DevigCard() {
  const [prices, setPrices] = useState<number[]>([-110, -110])
  const [method, setMethod] = useState<DevigMethod>('proportional')

  const report = useMemo(() => {
    try {
      const decimals = prices.map(decimalFromAmerican)
      return { ok: true as const, value: marketReport(decimals, method) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [prices, method])

  const setPrice = (i: number, v: number) => setPrices((cur) => cur.map((p, j) => (j === i ? v : p)))

  return (
    <section className="td-card">
      <h3 className="td-card-title">Devig a market</h3>
      <p className="td-card-note">
        Enter the prices you see; we recover the book’s true (no-vig) read of each side.
      </p>

      <div className="td-rows">
        {prices.map((p, i) => (
          <div className="td-row" key={i}>
            <span className="td-row-name">Side {i + 1}</span>
            <AmericanInput value={p} onChange={(v) => setPrice(i, v)} />
            {prices.length > 2 && (
              <button className="td-x" aria-label={`Remove side ${i + 1}`} onClick={() => setPrices((c) => c.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </div>
        ))}
        {prices.length < 4 && (
          <button className="td-add" onClick={() => setPrices((c) => [...c, -110])}>
            + outcome
          </button>
        )}
      </div>

      <MethodChips options={DEVIG_METHODS} value={method} onChange={(k) => setMethod(k as DevigMethod)} getKey={(o) => o.key} getLabel={(o) => o.label} />
      <p className="td-method-hint">{DEVIG_METHODS.find((m) => m.key === method)!.hint}</p>

      {report.ok ? (
        <>
          <dl className="td-stats">
            <Stat label="Overround" value={pct(report.value.overround, 2)} />
            <Stat label="Margin (vig)" value={pct(report.value.margin, 2)} accent />
            <Stat label="Hold" value={pct(report.value.hold, 2)} />
          </dl>
          <table className="td-table">
            <thead>
              <tr>
                <th>Outcome</th>
                <th className="td-num">Posted</th>
                <th className="td-num">Fair %</th>
                <th className="td-num">Fair price</th>
              </tr>
            </thead>
            <tbody>
              {report.value.fairProbabilities.map((fp, i) => (
                <tr key={i}>
                  <td>Side {i + 1}</td>
                  <td className="td-num">{formatAmerican(prices[i])}</td>
                  <td className="td-num">{pct(fp)}</td>
                  <td className="td-num">{formatAmerican(americanFromDecimal(report.value.fairDecimals[i]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="td-error">Enter valid American prices (≤ −100 or ≥ +100) for every side.</p>
      )}
    </section>
  )
}

/* ----------------------------- price maker ------------------------------- */

/** Post your own two-way market from a fair probability + a target margin. */
function PriceMakerCard() {
  const [homeProb, setHomeProb] = useState(0.55)
  const [marginPct, setMarginPct] = useState(4.5)
  const [method, setMethod] = useState<MarginMethod>('proportional')

  const priced = useMemo(() => {
    try {
      const [home, away] = twoWayPrices(homeProb, marginPct / 100, method)
      return { ok: true as const, home, away, overround: pricedOverround([home, away]) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [homeProb, marginPct, method])

  return (
    <section className="td-card">
      <h3 className="td-card-title">Make a price</h3>
      <p className="td-card-note">
        Turn a fair win probability into the two-way price you’d actually post, vig included.
      </p>

      <label className="td-field">
        <span className="td-field-label">
          Home fair win chance <strong>{pct(homeProb)}</strong>
        </span>
        <input className="td-slider" type="range" min={1} max={99} step={1} value={Math.round(homeProb * 100)} onChange={(e) => setHomeProb(Number(e.target.value) / 100)} />
      </label>

      <label className="td-field">
        <span className="td-field-label">Target margin</span>
        <div className="td-inline">
          <input className="td-num-input" type="number" min={0} max={30} step={0.5} value={marginPct} onChange={(e) => setMarginPct(Math.max(0, Number(e.target.value)))} />
          <span className="td-suffix">%</span>
        </div>
      </label>

      <MethodChips options={MARGIN_METHODS} value={method} onChange={(k) => setMethod(k as MarginMethod)} getKey={(o) => o.key} getLabel={(o) => o.label} />

      {priced.ok ? (
        <>
          <div className="td-pricepair">
            <PostedPrice name="Home" priced={priced.home} />
            <PostedPrice name="Away" priced={priced.away} />
          </div>
          <p className="td-overround">
            Posted overround <strong>{pct(priced.overround, 2)}</strong> · margin {pct(priced.overround - 1, 2)}
          </p>
        </>
      ) : (
        <p className="td-error">{priced.error}</p>
      )}
    </section>
  )
}

function PostedPrice({ name, priced }: { name: string; priced: { decimal: number; american: number } }) {
  return (
    <div className="td-posted">
      <span className="td-posted-name">{name}</span>
      <span className="td-posted-am">{formatAmerican(priced.american)}</span>
      <span className="td-posted-dec">{priced.decimal.toFixed(2)}</span>
    </div>
  )
}

/* ------------------------------- exposure -------------------------------- */

interface PosRow {
  name: string
  decimal: number
  stake: number // cents
}

/** Watch the book's risk on a market: net P&L per outcome, worst case, the hedge. */
function ExposureCard() {
  const [rows, setRows] = useState<PosRow[]>([
    { name: 'Home', decimal: 1.91, stake: 6000 },
    { name: 'Away', decimal: 1.91, stake: 4000 },
  ])

  const result = useMemo(() => {
    try {
      const positions: BookPosition[] = rows.map((r) => ({ name: r.name, decimal: r.decimal, stake: r.stake }))
      return { ok: true as const, report: exposure(positions), move: suggestLineMove(positions) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [rows])

  const setRow = (i: number, patch: Partial<PosRow>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <section className="td-card">
      <h3 className="td-card-title">Exposure & risk</h3>
      <p className="td-card-note">
        Enter the stakes you’ve taken on each side; see what the book wins or loses whoever covers.
      </p>

      <div className="td-rows">
        {rows.map((r, i) => (
          <div className="td-exprow" key={i}>
            <input className="td-name-input" value={r.name} aria-label={`Outcome ${i + 1} name`} onChange={(e) => setRow(i, { name: e.target.value })} />
            <label className="td-mini">
              <span>Price</span>
              <input className="td-num-input" type="number" min={1.01} step={0.01} value={r.decimal} onChange={(e) => setRow(i, { decimal: Math.max(1.01, Number(e.target.value)) })} />
            </label>
            <label className="td-mini">
              <span>Stake $</span>
              <input className="td-num-input" type="number" min={0} step={1} value={r.stake / 100} onChange={(e) => setRow(i, { stake: Math.max(0, toCents(Number(e.target.value))) })} />
            </label>
            {rows.length > 2 && (
              <button className="td-x" aria-label={`Remove ${r.name}`} onClick={() => setRows((c) => c.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </div>
        ))}
        {rows.length < 4 && (
          <button className="td-add" onClick={() => setRows((c) => [...c, { name: `Side ${c.length + 1}`, decimal: 2.0, stake: 0 }])}>
            + outcome
          </button>
        )}
      </div>

      {result.ok ? (
        <>
          <table className="td-table">
            <thead>
              <tr>
                <th>Outcome</th>
                <th className="td-num">Book P&L if it wins</th>
              </tr>
            </thead>
            <tbody>
              {result.report.outcomes.map((o) => (
                <tr key={o.name}>
                  <td>{o.name}</td>
                  <td className={`td-num ${o.ifWins < 0 ? 'is-down' : 'is-up'}`}>
                    {o.ifWins > 0 ? '+' : ''}
                    {formatMoney(o.ifWins)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="td-stats">
            <Stat label="Worst case" value={`${result.report.worstCase > 0 ? '+' : ''}${formatMoney(result.report.worstCase)}`} accent />
            <Stat label="On" value={result.report.worstOutcome} />
            <Stat label="Balanced" value={result.report.balanced ? 'Yes' : 'No'} />
          </dl>
          {result.move && (
            <div className="td-move">
              <p className="td-move-head">Shed risk: shorten {result.move.shorten}</p>
              <ul className="td-move-list">
                {result.move.moves.map((m) => (
                  <li key={m.name}>
                    {m.name}: <span className="td-dim">{m.from.toFixed(2)}</span> → <strong>{m.to.toFixed(2)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="td-error">{result.error}</p>
      )}
    </section>
  )
}

/* --------------------------------- props --------------------------------- */

/** Price a player prop and the alternate-line ladder around it. */
function PropCard() {
  const [prop, setProp] = useState<PlayerProp>(SAMPLE_PROPS[0])

  const sd = prop.sd ?? DEFAULT_STAT_SD[prop.stat]
  const priced = useMemo(() => {
    try {
      return { ok: true as const, value: pricePlayerProp(prop), pOver: propOverProbability(prop) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [prop])

  // An alt-line ladder of five rungs centred on the posted line; the step scales
  // with the stat's spread so a yards prop ladders in tens, a points prop in ones.
  const step = Math.max(0.5, Math.round(sd / 4))
  const ladder = useMemo(() => {
    try {
      const lines = [-2, -1, 0, 1, 2].map((k) => prop.line + k * step)
      return altLineLadder(prop.projection, sd, lines)
    } catch {
      return []
    }
  }, [prop, sd, step])

  return (
    <section className="td-card">
      <h3 className="td-card-title">Price a player prop</h3>
      <p className="td-card-note">
        A prop is an over/under on a projected stat; pick one and tune the line or projection.
      </p>

      <label className="td-field">
        <span className="td-field-label">Prop</span>
        <select
          className="td-select"
          value={prop.id}
          onChange={(e) => {
            const next = SAMPLE_PROPS.find((p) => p.id === e.target.value)
            if (next) setProp(next)
          }}
        >
          {SAMPLE_PROPS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.player} — {STAT_LABEL[p.stat]}
            </option>
          ))}
        </select>
      </label>

      <div className="td-proprow">
        <label className="td-mini">
          <span>Line</span>
          <input className="td-num-input" type="number" step={0.5} value={prop.line} onChange={(e) => setProp({ ...prop, line: Number(e.target.value) })} />
        </label>
        <label className="td-mini">
          <span>Projection</span>
          <input className="td-num-input" type="number" step={0.5} value={prop.projection} onChange={(e) => setProp({ ...prop, projection: Number(e.target.value) })} />
        </label>
        <span className="td-sd">σ {sd}</span>
      </div>

      {priced.ok ? (
        <>
          <div className="td-pricepair">
            <div className="td-posted">
              <span className="td-posted-name">Over {prop.line}</span>
              <span className="td-posted-am">{formatAmerican(priced.value.over.american)}</span>
              <span className="td-posted-dec">{pct(priced.pOver)} fair</span>
            </div>
            <div className="td-posted">
              <span className="td-posted-name">Under {prop.line}</span>
              <span className="td-posted-am">{formatAmerican(priced.value.under.american)}</span>
              <span className="td-posted-dec">{pct(1 - priced.pOver)} fair</span>
            </div>
          </div>

          <p className="td-card-note td-ladder-head">Alternate lines</p>
          <table className="td-table">
            <thead>
              <tr>
                <th>Line</th>
                <th className="td-num">Over</th>
                <th className="td-num">Under</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((rung) => (
                <tr key={rung.line} className={rung.line === prop.line ? 'is-current' : ''}>
                  <td>{rung.line}</td>
                  <td className="td-num">{formatAmerican(rung.over.american)}</td>
                  <td className="td-num">{formatAmerican(rung.under.american)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="td-error">{priced.error}</p>
      )}
    </section>
  )
}

/* ------------------------------ edge & kelly ----------------------------- */

/** Is a price +EV against a fair probability, and how much to stake (Kelly)? */
function EdgeKellyCard() {
  const [fairProb, setFairProb] = useState(0.55)
  const [american, setAmerican] = useState(-105)
  const [bankroll, setBankroll] = useState(100000) // cents ($1,000)
  const [mult, setMult] = useState(0.5)

  const out = useMemo(() => {
    try {
      const decimal = decimalFromAmerican(american)
      return {
        ok: true as const,
        decimal,
        ev: expectedValue(fairProb, decimal),
        value: isValueBet(fairProb, decimal),
        breakEven: breakEvenProbability(decimal),
        kFull: kellyFraction(fairProb, decimal),
        kFrac: kellyFraction(fairProb, decimal, mult),
        kStake: kellyStake(fairProb, decimal, bankroll, mult),
      }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [fairProb, american, bankroll, mult])

  return (
    <section className="td-card">
      <h3 className="td-card-title">Edge & Kelly</h3>
      <p className="td-card-note">
        Against your fair probability, is the offered price +EV — and what’s the Kelly stake?
      </p>

      <label className="td-field">
        <span className="td-field-label">
          Fair win chance <strong>{pct(fairProb)}</strong>
        </span>
        <input className="td-slider" type="range" min={1} max={99} step={1} value={Math.round(fairProb * 100)} onChange={(e) => setFairProb(Number(e.target.value) / 100)} />
      </label>

      <div className="td-proprow">
        <label className="td-mini">
          <span>Offered price</span>
          <AmericanInput value={american} onChange={setAmerican} />
        </label>
        <label className="td-mini">
          <span>Bankroll $</span>
          <input className="td-num-input" type="number" min={0} step={10} value={bankroll / 100} onChange={(e) => setBankroll(Math.max(0, toCents(Number(e.target.value))))} />
        </label>
      </div>

      <MethodChips options={KELLY_OPTS} value={String(mult)} onChange={(k) => setMult(Number(k))} getKey={(o) => String(o.mult)} getLabel={(o) => o.label} />

      {out.ok ? (
        <>
          <dl className="td-stats">
            <Stat label="EV / unit" value={signedPct(out.ev)} accent />
            <Stat label="Break-even" value={pct(out.breakEven)} />
            <Stat label="Value bet" value={out.value ? 'Yes' : 'No'} />
          </dl>
          <dl className="td-stats">
            <Stat label="Full Kelly" value={pct(out.kFull)} />
            <Stat label="Staked frac." value={pct(out.kFrac)} />
            <Stat label="Kelly stake" value={formatMoney(Math.round(out.kStake))} accent />
          </dl>
        </>
      ) : (
        <p className="td-error">Enter a valid American price (≤ −100 or ≥ +100).</p>
      )}
    </section>
  )
}

/* ------------------------------- arbitrage ------------------------------- */

/** Across the best price on each side (often different books), is there an arb? */
function ArbitrageCard() {
  const [decimals, setDecimals] = useState<number[]>([2.05, 2.1])

  const out = useMemo(() => {
    try {
      return { ok: true as const, value: arbitrage(decimals) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [decimals])

  const setD = (i: number, v: number) => setDecimals((cur) => cur.map((d, j) => (j === i ? v : d)))

  return (
    <section className="td-card">
      <h3 className="td-card-title">Arbitrage check</h3>
      <p className="td-card-note">
        Enter the best decimal price on each outcome. If they sum under 100%, backing every side
        locks a profit.
      </p>

      <div className="td-rows">
        {decimals.map((d, i) => (
          <div className="td-row" key={i}>
            <span className="td-row-name">Side {i + 1}</span>
            <input className="td-num-input" type="number" min={1.01} step={0.01} value={d} onChange={(e) => setD(i, Math.max(1.01, Number(e.target.value)))} />
            {decimals.length > 2 && (
              <button className="td-x" aria-label={`Remove side ${i + 1}`} onClick={() => setDecimals((c) => c.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </div>
        ))}
        {decimals.length < 4 && (
          <button className="td-add" onClick={() => setDecimals((c) => [...c, 2.0])}>
            + outcome
          </button>
        )}
      </div>

      {out.ok ? (
        <>
          <dl className="td-stats">
            <Stat label="Book %" value={pct(out.value.overround, 2)} />
            <Stat label="Arb?" value={out.value.isArbitrage ? 'Yes' : 'No'} accent={out.value.isArbitrage} />
            <Stat label="Locked profit" value={out.value.isArbitrage ? signedPct(out.value.profitMargin, 2) : '—'} />
          </dl>
          {out.value.isArbitrage && (
            <table className="td-table">
              <thead>
                <tr>
                  <th>Outcome</th>
                  <th className="td-num">Stake share</th>
                </tr>
              </thead>
              <tbody>
                {out.value.stakeFractions.map((f, i) => (
                  <tr key={i}>
                    <td>Side {i + 1}</td>
                    <td className="td-num">{pct(f)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p className="td-error">{out.error}</p>
      )}
    </section>
  )
}

/* -------------------------------- teasers -------------------------------- */

/** Price a teaser from the standard payout tables. */
function TeaserCard() {
  const [sport, setSport] = useState<TeaserSport>('football')
  const pointsForSport = useMemo(() => TEASER_TABLES.filter((t) => t.sport === sport).map((t) => t.points), [sport])
  const [points, setPoints] = useState(6)
  const [legs, setLegs] = useState(2)

  // Keep the selected points valid when the sport changes.
  const activePoints = pointsForSport.includes(points) ? points : pointsForSport[0]
  const table = TEASER_TABLES.find((t) => t.sport === sport && t.points === activePoints)

  const out = useMemo(() => {
    try {
      return { ok: true as const, decimal: teaserDecimal(sport, activePoints, legs) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [sport, activePoints, legs])

  return (
    <section className="td-card">
      <h3 className="td-card-title">Teaser pricer</h3>
      <p className="td-card-note">
        Move every leg’s spread or total your way by a set number of points, for a shorter combined
        price. Every leg must still win at the teased number.
      </p>

      <div className="td-methods">
        {(['football', 'basketball'] as TeaserSport[]).map((s) => (
          <button key={s} className={`chip ${sport === s ? 'is-on' : ''}`} onClick={() => setSport(s)}>
            {s === 'football' ? 'Football' : 'Basketball'}
          </button>
        ))}
      </div>

      <label className="td-field">
        <span className="td-field-label">Points</span>
        <div className="td-methods">
          {pointsForSport.map((p) => (
            <button key={p} className={`chip ${activePoints === p ? 'is-on' : ''}`} onClick={() => setPoints(p)}>
              {p} pt
            </button>
          ))}
        </div>
      </label>

      <label className="td-field">
        <span className="td-field-label">Legs</span>
        <div className="td-methods">
          {[2, 3, 4, 5, 6].map((n) => (
            <button key={n} className={`chip ${legs === n ? 'is-on' : ''}`} onClick={() => setLegs(n)}>
              {n}
            </button>
          ))}
        </div>
      </label>

      {out.ok ? (
        <dl className="td-stats">
          <Stat label="Teaser price" value={formatAmerican(americanFromDecimal(out.decimal))} accent />
          <Stat label="Decimal" value={out.decimal.toFixed(2)} />
          <Stat label="Per $100" value={formatMoney(Math.round(10000 * out.decimal))} />
        </dl>
      ) : (
        <p className="td-error">{out.error}</p>
      )}

      {table && (
        <>
          <p className="td-card-note td-ladder-head">{activePoints}-point payout table</p>
          <table className="td-table">
            <thead>
              <tr>
                <th>Legs</th>
                <th className="td-num">Price</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(table.payouts).map(([n, am]) => (
                <tr key={n} className={Number(n) === legs ? 'is-current' : ''}>
                  <td>{n}</td>
                  <td className="td-num">{formatAmerican(am)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

/* --------------------------------- boosts -------------------------------- */

/** Apply a profit boost, and value a free bet, at a given price. */
function BoostCard() {
  const [american, setAmerican] = useState(200)
  const [pctBoost, setPctBoost] = useState(0.5)
  const [stake, setStake] = useState(2500) // cents ($25)

  const out = useMemo(() => {
    try {
      const decimal = decimalFromAmerican(american)
      const boosted = boostProfit(decimal, pctBoost)
      return {
        ok: true as const,
        decimal,
        boosted,
        boostedReturn: boostedReturn(stake, decimal, pctBoost),
        freeBetValue: freeBetValue(stake, decimal),
        freeBetReturn: freeBetReturn(stake, decimal),
      }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [american, pctBoost, stake])

  return (
    <section className="td-card">
      <h3 className="td-card-title">Boosts & free bets</h3>
      <p className="td-card-note">
        A profit boost lifts the winnings on a price; a free bet pays the winnings but keeps the
        stake — so it’s worth less than face.
      </p>

      <div className="td-proprow">
        <label className="td-mini">
          <span>Base price</span>
          <AmericanInput value={american} onChange={setAmerican} />
        </label>
        <label className="td-mini">
          <span>Stake $</span>
          <input className="td-num-input" type="number" min={0} step={1} value={stake / 100} onChange={(e) => setStake(Math.max(0, toCents(Number(e.target.value))))} />
        </label>
      </div>

      <MethodChips options={BOOST_OPTS} value={String(pctBoost)} onChange={(k) => setPctBoost(Number(k))} getKey={(o) => String(o.pct)} getLabel={(o) => o.label} />

      {out.ok ? (
        <>
          <div className="td-pricepair">
            <div className="td-posted">
              <span className="td-posted-name">Boosted price</span>
              <span className="td-posted-am">{formatAmerican(americanFromDecimal(out.boosted))}</span>
              <span className="td-posted-dec">from {formatAmerican(american)}</span>
            </div>
            <div className="td-posted">
              <span className="td-posted-name">Boosted return</span>
              <span className="td-posted-am">{formatMoney(out.boostedReturn)}</span>
              <span className="td-posted-dec">on {formatMoney(stake)}</span>
            </div>
          </div>
          <dl className="td-stats">
            <Stat label="Free-bet return" value={formatMoney(out.freeBetReturn)} />
            <Stat label="Free-bet value" value={formatMoney(out.freeBetValue)} accent />
          </dl>
        </>
      ) : (
        <p className="td-error">Enter a valid American price (≤ −100 or ≥ +100).</p>
      )}
    </section>
  )
}

/* --------------------------------- bits ---------------------------------- */

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="td-stat">
      <span className="td-stat-label">{label}</span>
      <span className={`td-stat-value ${accent ? 'is-accent' : ''}`}>{value}</span>
    </div>
  )
}

/** A reusable chip-strip keyed by string; callers narrow the key in `onChange`. */
function MethodChips<T>({
  options,
  value,
  onChange,
  getKey,
  getLabel,
}: {
  options: T[]
  value: string
  onChange: (k: string) => void
  getKey: (o: T) => string
  getLabel: (o: T) => string
}) {
  return (
    <div className="td-methods" role="group">
      {options.map((o) => {
        const k = getKey(o)
        return (
          <button key={k} className={`chip ${value === k ? 'is-on' : ''}`} onClick={() => onChange(k)}>
            {getLabel(o)}
          </button>
        )
      })}
    </div>
  )
}

/** A small American-odds input that commits a valid number on change. */
function AmericanInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      className="td-num-input td-am-input"
      type="number"
      step={5}
      value={value}
      onChange={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v)) onChange(v)
      }}
    />
  )
}
