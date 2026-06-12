/**
 * Line-management controls for the trading desk's Lines tab (CLAUDE.md §4) — Part 3.
 *
 * Two modes over the SAME pipeline (feed → margin → adjustments → override):
 *
 *  - SIMPLE (default): one screen, no jargon. A house-edge slider (one global hold with
 *    per-league quick variants), and — on each market row in the list — line nudge,
 *    one-tap suspend, and a Follow-feed toggle. Everything is 1–2 taps and the published
 *    number updates immediately.
 *  - ADVANCED: the full trading desk. A per-league×market margin matrix, directional
 *    shading, a manual override editor (with a live preview + drift), exposure/drift
 *    auto-rules, alt-line generation, and per-player circling. Every control carries a
 *    plain-English one-liner, an expandable "What does this do?" with a worked example,
 *    and a live preview before you commit.
 *
 * Holds no points; every write goes through the overlay/precedence mutators (audited).
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createStore, persistedDoc } from '../../../persistence/index.js'
import {
  LEAGUES,
  formatAmerican,
  effectiveMargin,
  getHouseMargin,
  setHouseMargin,
  getLeagueMarketMargin,
  setLeagueMarketMargin,
  setLineOverride,
  clearLineOverride,
  setShade,
  getAdjustment,
  subscribeHouseMargin,
  getHouseMarginVersion,
  altLineLadderSpread,
  type GameEvent,
  type MarketKind,
} from '../../index.js'
import {
  twoWayPrices,
  getAutoRules,
  setAutoRules,
  subscribeAutoRules,
  getAutoRulesVersion,
  evaluateExposureRule,
} from '../index.js'
import { toCents, formatMoney } from '../../../games/shared/money.js'

export type LineMode = 'simple' | 'advanced'
const MARKETS: MarketKind[] = ['moneyline', 'spread', 'total']
const MARKET_LABEL: Record<MarketKind, string> = { moneyline: 'Moneyline', spread: 'Spread', total: 'Total' }

/* ===================== a negative-sign-friendly number input ===================== */

/**
 * A text-backed number field that lets you TYPE a negative sign (and a lone "−" or a
 * trailing decimal point) without the value snapping back — the trap with `<input
 * type=number>` for line/price entry. Commits a parsed number as soon as the draft is a
 * full number; reverts a dangling "−"/"" on blur.
 */
export function SignedNumberInput({
  value,
  onChange,
  allowDecimal = true,
  ariaLabel,
  className = 'td-num-input',
  placeholder,
}: {
  value: number
  onChange: (v: number) => void
  allowDecimal?: boolean
  ariaLabel?: string
  className?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const pattern = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/
  const partial = (s: string) => s === '' || s === '-' || s === '.' || s === '-.'

  return (
    <input
      className={className}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value
        if (!pattern.test(v)) return // reject letters etc., keep the prior draft
        setDraft(v)
        if (!partial(v)) {
          const n = Number(v)
          if (Number.isFinite(n)) onChange(n)
        }
      }}
      onBlur={() => {
        if (partial(draft)) setDraft(String(value)) // revert a dangling "−"/""
      }}
    />
  )
}

/* ============================ shared explainer + preview ============================ */

/** A control's expandable "What does this do?" with a concrete worked example. */
export function Explainer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="tdx-explain">
      <summary className="tdx-explain-q">What does this do?</summary>
      <div className="tdx-explain-a">
        <strong>{title}</strong>
        {children}
      </div>
    </details>
  )
}

/** The −110/−110 → X/Y worked example for a margin, computed live. */
function marginExample(margin: number): string {
  const [a] = twoWayPrices(0.5, margin, 'proportional')
  return `a fair −100/−100 line becomes ${formatAmerican(a.american)}/${formatAmerican(a.american)}`
}

/* ================================== mode toggle =================================== */

export function LineModeToggle({ mode, onChange }: { mode: LineMode; onChange: (m: LineMode) => void }) {
  return (
    <div className="tdx-mode" role="tablist" aria-label="Trading mode">
      {(['simple', 'advanced'] as LineMode[]).map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          className={`tdx-mode-btn ${mode === m ? 'is-on' : ''}`}
          onClick={() => onChange(m)}
        >
          {m === 'simple' ? 'Simple' : 'Advanced'}
        </button>
      ))}
    </div>
  )
}

/* ============================== SIMPLE: house edge ================================ */

const EDGE_PRESETS: { label: string; margin: number | null }[] = [
  { label: 'Off', margin: null },
  { label: '2%', margin: 0.02 },
  { label: '3%', margin: 0.03 },
  { label: '4.5%', margin: 0.045 },
  { label: '6%', margin: 0.06 },
  { label: '8%', margin: 0.08 },
  { label: '10%', margin: 0.1 },
]

export function SimpleHouseEdge() {
  useSyncHouseMargin()
  const house = getHouseMargin()

  return (
    <section className="td-card tdx-card">
      <h3 className="td-card-title">House edge</h3>
      <p className="td-card-hint">
        One hold applied across the whole board. Tap a level — every market reprices to it at once.
      </p>

      <div className="tdx-edge-row" role="group" aria-label="House edge">
        {EDGE_PRESETS.map((p) => (
          <button
            key={p.label}
            className={`tdx-edge-btn ${house === p.margin ? 'is-on' : ''}`}
            onClick={() => setHouseMargin(p.margin)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="tdx-preview">
        {house == null ? 'Markets sit at the feed price.' : `At ${(house * 100).toFixed(1)}%, ${marginExample(house)}.`}
      </p>

      <Explainer title="The book’s built-in margin (juice).">
        <p>
          A higher hold widens both sides of every price, so the book keeps more over time. Set it
          once here and it applies everywhere; a specific league or market can still be tuned in
          Advanced. Example: at 6%, {marginExample(0.06)}.
        </p>
      </Explainer>

      <p className="td-card-hint tdx-sub">Per-league quick variants</p>
      <div className="tdx-league-list">
        {LEAGUES.map((lg) => (
          <LeagueEdge key={lg} league={lg} houseGlobal={house} />
        ))}
      </div>
    </section>
  )
}

/** A compact per-league hold: bumps the league's spread+total+ML margin together. */
function LeagueEdge({ league, houseGlobal }: { league: string; houseGlobal: number | null }) {
  const eff = effectiveMargin(league, 'spread').margin ?? houseGlobal
  const set = (m: number | null) => {
    for (const market of MARKETS) setLeagueMarketMargin(league, market, m)
  }
  const cur = eff ?? 0
  return (
    <div className="tdx-league">
      <span className="tdx-league-name">{league}</span>
      <span className="tdx-league-ctl">
        <button className="td-step" aria-label={`Lower ${league} hold`} onClick={() => set(Math.max(0, +(cur - 0.005).toFixed(3)) || null)}>
          −
        </button>
        <span className="tdx-league-val">{eff == null ? '—' : `${(eff * 100).toFixed(1)}%`}</span>
        <button className="td-step" aria-label={`Raise ${league} hold`} onClick={() => set(+(cur + 0.005).toFixed(3))}>
          +
        </button>
        {getLeagueMarketMargin(league, 'spread') != null && (
          <button className="tdx-clear" onClick={() => set(null)} aria-label={`Reset ${league}`}>
            ↺
          </button>
        )}
      </span>
    </div>
  )
}

/* ====================== SIMPLE/both: follow-feed (freeze) ========================= */

/**
 * Per-market Follow-feed toggle. ON = the market tracks the live feed through the
 * pipeline. OFF (Frozen) = pin the current published number as an override so feed moves
 * don't change it (Part 2: overrides win and aren't clobbered; drift shows the gap).
 */
export function FollowFeedToggle({ event, market }: { event: GameEvent; market: MarketKind }) {
  const adj = getAdjustment(event.id, market)
  const frozen = !!adj?.override && (!!adj.override.odds || adj.override.line != null)
  const sels = event.selections.filter((s) => s.market === market)

  const toggle = () => {
    if (frozen) {
      clearLineOverride(event.id, market)
    } else {
      const home = sels.find((s) => s.pick === 'home' || s.pick === 'over')
      const away = sels.find((s) => s.pick === 'away' || s.pick === 'under')
      if (!home || !away) return
      setLineOverride(event.id, market, {
        odds: [home.odds, away.odds],
        line: market === 'moneyline' ? undefined : (home.line ?? undefined),
      })
    }
  }
  return (
    <button
      className={`tdx-follow ${frozen ? 'is-frozen' : ''}`}
      onClick={toggle}
      title={frozen ? 'Frozen — click to follow the live feed again' : 'Following the live feed'}
      aria-pressed={!frozen}
    >
      {frozen ? '🔒 Frozen' : '📡 Follow feed'}
    </button>
  )
}

/* ===================== ADVANCED: per-market margin matrix ========================= */

export function MarginMatrix() {
  useSyncHouseMargin()
  return (
    <section className="td-card tdx-card">
      <h3 className="td-card-title">Margin matrix</h3>
      <p className="td-card-hint">A different hold per league × market — e.g. tighter on NFL spreads, fatter on props.</p>
      <Explainer title="Per-league, per-market juice.">
        <p>
          The house edge is one number for everything; this overrides it for a specific cell. Set
          NBA totals to 8% and only NBA totals reprice — {marginExample(0.08)}. Leave a cell blank
          to inherit the house edge.
        </p>
      </Explainer>
      <div className="tdx-matrix-wrap">
        <table className="td-table tdx-matrix">
          <thead>
            <tr>
              <th>League</th>
              {MARKETS.map((m) => (
                <th key={m} className="td-num">
                  {MARKET_LABEL[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEAGUES.map((lg) => (
              <tr key={lg}>
                <td>{lg}</td>
                {MARKETS.map((m) => (
                  <td key={m} className="td-num">
                    <MatrixCell league={lg} market={m} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MatrixCell({ league, market }: { league: string; market: MarketKind }) {
  const cur = getLeagueMarketMargin(league, market)
  const pctValue = cur == null ? 0 : +(cur * 100).toFixed(1)
  return (
    <span className="tdx-cell">
      <SignedNumberInput
        value={pctValue}
        onChange={(v) => setLeagueMarketMargin(league, market, v <= 0 ? null : v / 100)}
        ariaLabel={`${league} ${market} margin %`}
        className="td-num-input tdx-cell-input"
        placeholder="—"
      />
      <span className="tdx-cell-suffix">%</span>
    </span>
  )
}

/* ========================= ADVANCED: directional shading ========================= */

export function ShadeControl({ event, market }: { event: GameEvent; market: MarketKind }) {
  const adj = getAdjustment(event.id, market)
  const bps = adj?.shadeBps ?? 0
  return (
    <span className="tdx-shade" role="group" aria-label="Directional shading">
      <button className="td-step" aria-label="Shade toward away/under" onClick={() => setShade(event.id, market, bps - 25)}>
        ◄
      </button>
      <span className="tdx-shade-val" title="basis points toward home/over (+) or away/under (−)">
        {bps > 0 ? `+${bps}` : bps} bps
      </span>
      <button className="td-step" aria-label="Shade toward home/over" onClick={() => setShade(event.id, market, bps + 25)}>
        ►
      </button>
    </span>
  )
}

/* ====================== ADVANCED: manual override editor ========================= */

export function OverrideEditor({ event, market }: { event: GameEvent; market: MarketKind }) {
  const sels = event.selections.filter((s) => s.market === market)
  const home = sels.find((s) => s.pick === 'home' || s.pick === 'over')
  const away = sels.find((s) => s.pick === 'away' || s.pick === 'under')
  const adj = getAdjustment(event.id, market)
  const ov = adj?.override

  const [homeOdds, setHomeOdds] = useState(ov?.odds?.[0] ?? home?.odds ?? -110)
  const [awayOdds, setAwayOdds] = useState(ov?.odds?.[1] ?? away?.odds ?? -110)
  const [line, setLine] = useState(ov?.line ?? home?.line ?? 0)

  const drift = home ? homeOdds - home.odds : 0

  if (!home || !away) return null
  return (
    <div className="tdx-override">
      <span className="tdx-override-grid">
        <label className="td-mini">
          <span>{market === 'total' ? 'Over' : 'Home'}</span>
          <SignedNumberInput value={homeOdds} onChange={setHomeOdds} allowDecimal={false} ariaLabel="Home/over price" />
        </label>
        <label className="td-mini">
          <span>{market === 'total' ? 'Under' : 'Away'}</span>
          <SignedNumberInput value={awayOdds} onChange={setAwayOdds} allowDecimal={false} ariaLabel="Away/under price" />
        </label>
        {market !== 'moneyline' && (
          <label className="td-mini">
            <span>Line</span>
            <SignedNumberInput value={line} onChange={setLine} ariaLabel="Line/handicap" />
          </label>
        )}
      </span>
      <p className="tdx-preview">
        Publishes <b>{formatAmerican(homeOdds)}</b>/<b>{formatAmerican(awayOdds)}</b>
        {market !== 'moneyline' && <> at <b>{line}</b></>} · drift vs feed{' '}
        <span className={drift === 0 ? '' : drift > 0 ? 'is-up' : 'is-down'}>
          {drift > 0 ? '+' : ''}
          {drift}
        </span>
      </p>
      <div className="tdx-override-actions">
        <button
          className="tdx-btn is-primary"
          onClick={() =>
            setLineOverride(event.id, market, {
              odds: [homeOdds, awayOdds],
              line: market === 'moneyline' ? undefined : line,
            })
          }
        >
          Pin override
        </button>
        {ov && (
          <button className="tdx-btn" onClick={() => clearLineOverride(event.id, market)}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

/* ========================= ADVANCED: exposure auto-rules ========================== */

export function AutoRulesPanel() {
  useSyncExternalAutoRules()
  const rules = getAutoRules()
  const ex = rules.exposure
  const dr = rules.drift

  // Live preview of the exposure rule against a sample lopsided book.
  const preview = evaluateExposureRule(ex, 120_000, 20_000)

  return (
    <section className="td-card tdx-card">
      <h3 className="td-card-title">Exposure auto-rules</h3>
      <p className="td-card-hint">Let the book defend itself between manual touches. Both are off until you arm them.</p>

      <div className="tdx-rule">
        <label className="tdx-rule-head">
          <input type="checkbox" checked={ex.enabled} onChange={(e) => setAutoRules({ exposure: { ...ex, enabled: e.target.checked } })} />
          <span>Balance a lopsided market</span>
        </label>
        <p className="td-card-hint">
          If one side is over by{' '}
          <SignedNumberInput
            value={ex.maxSideExposureCents / 100}
            allowDecimal={false}
            onChange={(v) => setAutoRules({ exposure: { ...ex, maxSideExposureCents: toCents(Math.max(0, v)) } })}
            ariaLabel="Max side exposure dollars"
            className="td-num-input tdx-inline-input"
          />{' '}
          dollars, move the line{' '}
          <SignedNumberInput
            value={ex.moveIncrements}
            allowDecimal={false}
            onChange={(v) => setAutoRules({ exposure: { ...ex, moveIncrements: Math.max(1, v) } })}
            ariaLabel="Move increments"
            className="td-num-input tdx-inline-input"
          />{' '}
          half-points toward balance.
        </p>
        <p className="tdx-preview">
          Preview: with {formatMoney(120_000)} home vs {formatMoney(20_000)} away,{' '}
          {preview ? `move ${preview.deltaPoints} pt toward ${preview.toward}.` : 'no move (within threshold).'}
        </p>
      </div>

      <div className="tdx-rule">
        <label className="tdx-rule-head">
          <input type="checkbox" checked={dr.enabled} onChange={(e) => setAutoRules({ drift: { ...dr, enabled: e.target.checked } })} />
          <span>Auto-suspend on a steam move</span>
        </label>
        <p className="td-card-hint">
          If the source line moves more than{' '}
          <SignedNumberInput
            value={dr.maxLineMove}
            onChange={(v) => setAutoRules({ drift: { ...dr, maxLineMove: Math.max(0, v) } })}
            ariaLabel="Max line move"
            className="td-num-input tdx-inline-input"
          />{' '}
          points within{' '}
          <SignedNumberInput
            value={dr.withinMinutes}
            allowDecimal={false}
            onChange={(v) => setAutoRules({ drift: { ...dr, withinMinutes: Math.max(1, v) } })}
            ariaLabel="Within minutes"
            className="td-num-input tdx-inline-input"
          />{' '}
          minutes, pull the market.
        </p>
      </div>

      <Explainer title="Guardrails that act on their own.">
        <p>
          Balancing trims the price on the heavy side so new money leans the other way. Steam-suspend
          pulls a market the instant the feed lurches — a likely sharp move — so you’re not picked off
          before you can react. Both fire through the same audited mutators a manager uses.
        </p>
      </Explainer>
    </section>
  )
}

/* ============================ ADVANCED: alt lines =============================== */

export function AltLinesCard() {
  const [main, setMain] = useState(-3.5)
  const ladder = useMemo(() => altLineLadderSpread(main, 3), [main])
  return (
    <section className="td-card tdx-card">
      <h3 className="td-card-title">Alternate lines</h3>
      <p className="td-card-hint">Derive a ladder of alt spreads/totals around a main number on a standard curve.</p>
      <label className="td-mini">
        <span>Main line</span>
        <SignedNumberInput value={main} onChange={setMain} ariaLabel="Main line" />
      </label>
      <table className="td-table">
        <thead>
          <tr>
            <th>Line</th>
            <th className="td-num">Fav</th>
            <th className="td-num">Dog</th>
          </tr>
        </thead>
        <tbody>
          {ladder.map((r) => (
            <tr key={r.line} className={r.line === main ? 'is-current' : ''}>
              <td>{r.line}</td>
              <td className="td-num">{formatAmerican(r.odds[0])}</td>
              <td className="td-num">{formatAmerican(r.odds[1])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Explainer title="Lines around the main number.">
        <p>
          Each half-point you give the bettor lengthens their price on a fixed curve. Useful for
          offering −2.5 (−150) / −3.5 (−110) / −4.5 (+120) off one main line without pricing each by
          hand.
        </p>
      </Explainer>
    </section>
  )
}

/* ============================ ADVANCED: circling =============================== */

export interface CirclingApi {
  players: { id: string; name: string; circled: boolean; maxWager: number | null }[]
  setCircled: (playerId: string, on: boolean) => void
}

/** Per-player circling — flag a sharp/abusive player for reduced limits. Reuses the real
 *  per-player max-bet lever (org limits); the app layer injects the handlers so this UI
 *  stays points-free. When not injected, it explains where circling is managed. */
export function CirclingSection({ circling }: { circling?: CirclingApi }) {
  return (
    <section className="td-card tdx-card">
      <h3 className="td-card-title">Circled players</h3>
      <p className="td-card-hint">Cut limits for a player the book wants to slow down.</p>
      <Explainer title="Per-player limit reduction.">
        <p>
          Circling flags a player so their max bet drops to a holding limit on every market — the
          standard tool for a sharp or a bonus-abuser. Their figure still settles through the same
          core path; they just can’t fire big. (Worse per-player prices are a planned extension.)
        </p>
      </Explainer>
      {circling ? (
        <table className="td-table">
          <thead>
            <tr>
              <th>Player</th>
              <th className="td-num">Max bet</th>
              <th>Circle</th>
            </tr>
          </thead>
          <tbody>
            {circling.players.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="td-num">{p.maxWager == null ? '—' : formatMoney(p.maxWager)}</td>
                <td>
                  <button
                    className={`tdx-follow ${p.circled ? 'is-frozen' : ''}`}
                    aria-pressed={p.circled}
                    onClick={() => circling.setCircled(p.id, !p.circled)}
                  >
                    {p.circled ? 'Circled' : 'Circle'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="td-card-hint">Manage circling from the player Limits tool.</p>
      )}
    </section>
  )
}

/* ============================== first-run guided tour ============================== */

const tourStore = createStore({ namespace: 'dimebag' })
const TOUR = persistedDoc<boolean>(tourStore, 'lines.tourSeen', { version: 1, initial: false })

const TOUR_STEPS = [
  { k: 'Feed', d: 'The live odds the vendor sends in — the starting number.' },
  { k: 'Margin', d: 'Your house edge widens both sides. Set it once; tune per league/market in Advanced.' },
  { k: 'Adjustments', d: 'Line nudges and directional shading lean a market your way.' },
  { k: 'Override', d: 'Pin an exact number. It wins over everything and the feed can’t move it — you’ll see the drift.' },
]

export function LinesGuidedTour() {
  const [open, setOpen] = useState(!TOUR.load())
  const [step, setStep] = useState(0)
  if (!open) return null
  const dismiss = () => {
    TOUR.save(true)
    setOpen(false)
  }
  const s = TOUR_STEPS[step]
  const last = step === TOUR_STEPS.length - 1
  return (
    <div className="tdx-tour" role="dialog" aria-label="How line management works">
      <div className="tdx-tour-head">
        <span className="tdx-tour-chip">
          {step + 1}/{TOUR_STEPS.length}
        </span>
        <strong>The pricing pipeline</strong>
        <button className="tdx-tour-x" aria-label="Dismiss" onClick={dismiss}>
          ×
        </button>
      </div>
      <p className="tdx-tour-flow">
        {TOUR_STEPS.map((t, i) => (
          <span key={t.k} className={`tdx-tour-stage ${i === step ? 'is-on' : ''}`}>
            {t.k}
            {i < TOUR_STEPS.length - 1 ? ' → ' : ''}
          </span>
        ))}
      </p>
      <p className="tdx-tour-body">
        <strong>{s.k}.</strong> {s.d}
      </p>
      <div className="tdx-tour-actions">
        <button className="tdx-btn" onClick={dismiss}>
          Skip
        </button>
        {last ? (
          <button className="tdx-btn is-primary" onClick={dismiss}>
            Got it
          </button>
        ) : (
          <button className="tdx-btn is-primary" onClick={() => setStep((n) => n + 1)}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}

/* --------------------------------- subscriptions --------------------------------- */

function useSyncHouseMargin() {
  useSyncExternalStore(subscribeHouseMargin, getHouseMarginVersion)
}
function useSyncExternalAutoRules() {
  useSyncExternalStore(subscribeAutoRules, getAutoRulesVersion)
}
