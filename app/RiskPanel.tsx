import { useMemo, useState, useSyncExternalStore } from 'react'
import { bookPending } from '../org/index.js'
import { formatMoney, toCents } from '../games/shared/money.js'
import { getBook, getBookVersion, subscribeBook } from './book-store.js'
import { getBookLedger, subscribeBookLedger } from './book-ledger.js'
import { getExposureByGame, subscribeExposure } from './exposure.js'
import { toBetRows } from './ledger-stats.js'
import { bookHold, holdByGame, winnersLosers, checkAlerts, type Standing } from './risk.js'
import {
  getRiskThresholds,
  getSettingsVersion,
  setRiskCreditUtil,
  setRiskExposureCap,
  subscribeSettings,
} from './settings-store.js'
import './risk-panel.css'

/**
 * Risk & exposure dashboard (CLAUDE.md §4) — the operator's read on the book: live
 * exposure, realized hold (book-wide + per game), the biggest winners/losers, and
 * configurable threshold alerts. Reads the durable ledger + the org; moves no money.
 * (Per-game LIVE open-exposure isn't shown — that needs open-wager-by-game tracking
 * the core doesn't model yet; this shows book-wide exposure + realized per-game hold.)
 */
export function RiskPanel() {
  const log = useSyncExternalStore(subscribeBookLedger, getBookLedger, getBookLedger)
  const exposureByGame = useSyncExternalStore(subscribeExposure, getExposureByGame, getExposureByGame)
  useSyncExternalStore(subscribeBook, getBookVersion)
  useSyncExternalStore(subscribeSettings, getSettingsVersion)

  const rows = useMemo(() => toBetRows(log), [log])
  const org = getBook()
  const hold = bookHold(rows)
  const games = holdByGame(rows)
  const { winners, losers } = winnersLosers(org)
  const exposure = bookPending(org, org.managerId)
  const t = getRiskThresholds()
  const alerts = checkAlerts(org, t, formatMoney, exposure)

  return (
    <section className="risk">
      <div className="risk-head">
        <h2 className="risk-title">Risk &amp; exposure</h2>
        <p className="risk-sub">
          Live exposure, realized hold, winners/losers, and alerts. Hold/handle reflect the most
          recent settled bets.
        </p>
      </div>

      {alerts.length > 0 && (
        <div className="risk-alerts">
          {alerts.map((a, i) => (
            <div key={i} className={`risk-alert is-${a.severity}`}>
              ⚠ {a.message}
            </div>
          ))}
        </div>
      )}

      <div className="risk-stats">
        <Stat label="Live exposure" value={formatMoney(exposure)} hint="At risk in open bets" />
        <Stat label="Handle" value={formatMoney(hold.handle)} hint={`${hold.bets} settled bets`} />
        <Stat
          label="Book net"
          value={`${hold.bookNet > 0 ? '+' : ''}${formatMoney(hold.bookNet)}`}
          tone={hold.bookNet > 0 ? 'up' : hold.bookNet < 0 ? 'down' : undefined}
        />
        <Stat
          label="Hold"
          value={`${(hold.hold * 100).toFixed(1)}%`}
          tone={hold.hold > 0 ? 'up' : hold.hold < 0 ? 'down' : undefined}
          hint="Book P&L ÷ handle"
        />
      </div>

      {exposureByGame.length > 0 && (
        <>
          <h3 className="risk-section">Live exposure by game</h3>
          <div className="risk-games">
            {exposureByGame.map((g) => (
              <div key={g.key} className="risk-grow">
                <span className="risk-game-name">{g.name}</span>
                <span className="risk-num" />
                <span className="risk-num" />
                <span className="risk-num" />
                <span className="risk-num">{formatMoney(g.open)}</span>
              </div>
            ))}
          </div>
        </>
      )}

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

      <div className="risk-cols">
        <Leaderboard title="Top winners" rows={winners} tone="up" empty="No players up." />
        <Leaderboard title="Top losers" rows={losers} tone="down" empty="No players down." />
      </div>

      <h3 className="risk-section">Alert thresholds</h3>
      <Thresholds creditUtil={t.creditUtil} exposureCap={t.exposureCap} />
    </section>
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

function Thresholds({ creditUtil, exposureCap }: { creditUtil: number; exposureCap: number | null }) {
  const [pct, setPct] = useState(String(Math.round(creditUtil * 100)))
  const [cap, setCap] = useState(exposureCap == null ? '' : String(exposureCap / 100))
  function commitPct() {
    const n = Number(pct)
    if (Number.isFinite(n) && n > 0 && n <= 100) setRiskCreditUtil(n / 100)
    else setPct(String(Math.round(getRiskThresholds().creditUtil * 100)))
  }
  function commitCap() {
    if (cap.trim() === '') return setRiskExposureCap(null)
    const n = Number(cap)
    if (Number.isFinite(n) && n >= 0) setRiskExposureCap(toCents(n))
    else {
      const live = getRiskThresholds().exposureCap
      setCap(live == null ? '' : String(live / 100))
    }
  }
  return (
    <div className="risk-thresholds">
      <label className="risk-th">
        <span>Credit-used alert at</span>
        <input
          className="risk-th-input"
          type="number"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          onBlur={commitPct}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span>%</span>
      </label>
      <label className="risk-th">
        <span>Book exposure cap $</span>
        <input
          className="risk-th-input"
          type="number"
          placeholder="off"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          onBlur={commitCap}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
    </div>
  )
}
