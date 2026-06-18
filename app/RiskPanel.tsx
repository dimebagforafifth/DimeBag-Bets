import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney, toCents } from '../games/shared/money.js'
import { getBook, getBookVersion, subscribeBook } from './book-store.js'
import { getBookLedger, subscribeBookLedger } from './book-ledger.js'
import { subscribeBets, getBetsVersion } from './book/bets-store.js'
import {
  consolidatedExposure,
  correlatedDownside,
  exposureByAgent,
  openBookBets,
  type ExposureRow,
} from './exposure.js'
import {
  evaluateBreaches,
  raiseAlertsForBreaches,
  runAutoActions,
  getAlerts,
  getThresholds,
  getSuspendedMarkets,
  getDemoBets,
  setThreshold,
  seedRiskDemo,
  subscribeRiskControls,
  riskControlsVersion,
  type Threshold,
} from './risk-controls.js'
import { toBetRows } from './ledger-stats.js'
import { bookHold, holdByGame, winnersLosers, type Standing } from './risk.js'
import './risk-panel.css'

/**
 * Risk & exposure dashboard (CLAUDE.md §4) — the operator's real read on the book's credit
 * downside: CONSOLIDATED open liability (by event / market / player / selection / bet-type,
 * rolled up the agent tree), the CORRELATED chalk-day worst case (parlay/SGP legs move
 * together), configurable threshold alerts, and one-tap auto-actions (suspend / reduce limit)
 * that route through the existing org per-member path. Plus realized hold + winners/losers.
 * Reads the bets store + durable ledger + org; moves no money.
 */
export function RiskPanel() {
  useEffect(() => {
    seedRiskDemo(Date.now())
  }, [])

  const log = useSyncExternalStore(subscribeBookLedger, getBookLedger, getBookLedger)
  const betsV = useSyncExternalStore(subscribeBets, getBetsVersion, getBetsVersion)
  useSyncExternalStore(subscribeBook, getBookVersion)
  useSyncExternalStore(subscribeRiskControls, riskControlsVersion)

  const org = getBook()
  // Real open bets + the display-only demo bets (merged for exposure; the demo set never
  // touches the shared bets store / core — see risk-controls.getDemoBets).
  const open = [...openBookBets(), ...getDemoBets()]
  const exposure = consolidatedExposure(open)
  const correlated = correlatedDownside(open)
  const agentRows = exposureByAgent(org, open)
  const thresholds = getThresholds()
  const breaches = evaluateBreaches(exposure, correlated, thresholds, org)
  const autoBreaches = breaches.filter((b) => b.action !== 'alert')

  // In-app alerts FIRE when a wager/exposure breaches a threshold (also drives the SMS/email
  // hook seam). Computed live from real + demo open bets; raising mutates only the alert
  // store, never the org — auto-ACTIONS stay explicit (the Enforce button / runAutoActions).
  useEffect(() => {
    const merged = [...openBookBets(), ...getDemoBets()]
    const b = evaluateBreaches(consolidatedExposure(merged), correlatedDownside(merged), getThresholds(), getBook())
    if (b.length) raiseAlertsForBreaches(b, Date.now())
  }, [betsV])

  const rows = useMemo(() => toBetRows(log), [log])
  const hold = bookHold(rows)
  const games = holdByGame(rows)
  const { winners, losers } = winnersLosers(org)
  const alerts = getAlerts()
  const suspended = getSuspendedMarkets()

  return (
    <section className="risk">
      <div className="risk-head">
        <h2 className="risk-title">Risk &amp; exposure</h2>
        <p className="risk-sub">
          Consolidated liability across singles, parlays & SGPs, the correlated chalk-day worst
          case, and threshold alerts with auto-actions. Reads the book; moves no money.
        </p>
      </div>

      {breaches.length > 0 && (
        <div className="risk-alerts">
          {breaches.map((b, i) => (
            <div key={i} className={`risk-alert is-${b.severity}`}>
              ⚠ {b.label} — {formatMoney(b.valueCents)} over the {formatMoney(b.limitCents)} limit
              {b.action !== 'alert' ? ` · auto-action ready: ${b.action}` : ''}
            </div>
          ))}
        </div>
      )}

      <div className="risk-stats">
        <Stat label="Live exposure" value={formatMoney(exposure.totalStakeCents)} hint="Open stake at risk" />
        <Stat label="Open liability" value={formatMoney(exposure.totalLiabilityCents)} hint={`${exposure.openBetCount} open bets · worst case`} tone="down" />
        <Stat label="Chalk-day downside" value={formatMoney(correlated.chalkLiabilityCents)} hint={`${correlated.chalkBetCount} all-favourite bets`} tone="down" />
        <Stat label="Handle" value={formatMoney(hold.handle)} hint={`${hold.bets} settled bets`} />
        <Stat label="Hold" value={`${(hold.hold * 100).toFixed(1)}%`} tone={hold.hold > 0 ? 'up' : hold.hold < 0 ? 'down' : undefined} hint="Book P&L ÷ handle" />
      </div>

      <div className="risk-grid">
        <ExposureTable title="By event" rows={exposure.byEvent} />
        <ExposureTable title="By market" rows={exposure.byMarket} />
        <ExposureTable title="By player" rows={exposure.byPlayer} />
        <ExposureTable title="By bet type" rows={exposure.byBetType} />
        <ExposureTable title="Top selections" rows={exposure.bySelection.slice(0, 6)} />
        <ExposureTable title="Up the agent tree" rows={agentRows} />
      </div>

      <h3 className="risk-section">Correlated downside — if the chalk lands</h3>
      <p className="risk-sub">
        {correlated.worstEvent
          ? `Worst single game on a chalk day: ${correlated.worstEvent.label} — ${formatMoney(correlated.worstEvent.liabilityCents)} at risk.`
          : 'No all-favourite exposure right now.'}
      </p>
      {correlated.sgpClusters.length > 0 && (
        <div className="risk-games">
          <div className="risk-erow is-head">
            <span>Same-game parlay</span>
            <span className="risk-elia">Liability</span>
            <span className="risk-ecount">Corr.</span>
          </div>
          {correlated.sgpClusters.map((c) => (
            <div key={c.eventId} className="risk-erow">
              <span className="risk-ename">{c.label}</span>
              <span className="risk-elia">{formatMoney(c.liabilityCents)}</span>
              <span className="risk-ecount">ρ {c.rho.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <h3 className="risk-section">Limits & alerts</h3>
      <div className="risk-games">
        {thresholds.map((t) => (
          <ThresholdRow key={t.id} t={t} />
        ))}
      </div>

      {autoBreaches.length > 0 && (
        <div className="risk-th-row">
          <span>
            {autoBreaches.length} breach{autoBreaches.length > 1 ? 'es' : ''} with an auto-action pending
          </span>
          <span />
          <span />
          <button className="risk-act" onClick={() => runAutoActions(autoBreaches, getBook(), Date.now())}>
            Enforce now
          </button>
        </div>
      )}

      {suspended.length > 0 && (
        <>
          <h3 className="risk-section">Suspended markets</h3>
          <div className="risk-chips">
            {suspended.map((m) => (
              <span key={m} className="risk-badge is-gold">
                {m}
              </span>
            ))}
          </div>
        </>
      )}

      {alerts.length > 0 && (
        <>
          <h3 className="risk-section">Alert log</h3>
          <div className="risk-alerts">
            {alerts.slice(0, 6).map((a) => (
              <div key={a.id} className={`risk-alert is-${a.acted ? 'acted' : a.severity}`}>
                {a.acted ? '✓ ' : '⚠ '}
                {a.message}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="risk-cols">
        <Leaderboard title="Top winners" rows={winners} tone="up" empty="No players up." />
        <Leaderboard title="Top losers" rows={losers} tone="down" empty="No players down." />
      </div>

      {games.length > 0 && (
        <>
          <h3 className="risk-section">By game (realized hold)</h3>
          <div className="risk-games">
            <div className="risk-grow is-head">
              <span>Game</span>
              <span className="risk-num">Bets</span>
              <span className="risk-num">Handle</span>
              <span className="risk-num">Book net</span>
              <span className="risk-num">Hold</span>
            </div>
            {games.map((g) => (
              <div key={g.key} className="risk-grow">
                <span className="risk-game-name">{g.name}</span>
                <span className="risk-num">{g.bets}</span>
                <span className="risk-num">{formatMoney(g.handle)}</span>
                <span className={`risk-num ${g.bookNet > 0 ? 'is-up' : g.bookNet < 0 ? 'is-down' : ''}`}>
                  {g.bookNet > 0 ? '+' : ''}
                  {formatMoney(g.bookNet)}
                </span>
                <span className={`risk-num ${g.hold > 0 ? 'is-up' : g.hold < 0 ? 'is-down' : ''}`}>
                  {(g.hold * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function ExposureTable({ title, rows }: { title: string; rows: ExposureRow[] }) {
  return (
    <div>
      <div className="risk-erow is-head">
        <span>{title}</span>
        <span className="risk-elia">Liability</span>
        <span className="risk-ecount">Bets</span>
      </div>
      {rows.length === 0 ? (
        <p className="risk-empty">None open.</p>
      ) : (
        rows.map((r) => (
          <div key={r.key} className="risk-erow">
            <span className="risk-ename">{r.label}</span>
            <span className="risk-elia">{formatMoney(r.liabilityCents)}</span>
            <span className="risk-ecount">{r.betCount}</span>
          </div>
        ))
      )}
    </div>
  )
}

function ThresholdRow({ t }: { t: Threshold }) {
  const [limit, setLimit] = useState(String(t.limitCents / 100))
  function commit() {
    const n = Number(limit)
    if (Number.isFinite(n) && n >= 0) setThreshold(t.id, { limitCents: toCents(n) })
    else setLimit(String(t.limitCents / 100))
  }
  return (
    <div className="risk-th-row">
      <input type="checkbox" checked={t.enabled} aria-label={`enable ${t.label}`} onChange={(e) => setThreshold(t.id, { enabled: e.target.checked })} />
      <span>
        {t.label} <span className="risk-badge">{t.action}</span>
      </span>
      <span className="risk-elia">$</span>
      <input
        className="risk-th-input"
        type="number"
        value={limit}
        aria-label={`${t.label} limit`}
        onChange={(e) => setLimit(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'up' | 'down' }) {
  return (
    <div className="risk-stat">
      <span className="risk-stat-label">{label}</span>
      <span className={`risk-stat-value ${tone ? `is-${tone}` : ''}`}>{value}</span>
      {hint && <span className="risk-stat-hint">{hint}</span>}
    </div>
  )
}

function Leaderboard({ title, rows, tone, empty }: { title: string; rows: Standing[]; tone: 'up' | 'down'; empty: string }) {
  return (
    <div className="risk-board">
      <h3 className="risk-section">{title}</h3>
      {rows.length === 0 ? (
        <p className="risk-empty">{empty}</p>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="risk-brow">
            <span className="risk-bname">{r.name}</span>
            <span className={`risk-num is-${tone}`}>
              {r.figure > 0 ? '+' : ''}
              {formatMoney(r.figure)}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
