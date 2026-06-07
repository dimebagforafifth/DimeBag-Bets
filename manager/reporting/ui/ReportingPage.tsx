import { useMemo, useState, useSyncExternalStore } from 'react'
import { formatMoney } from '../../../games/shared/money.js'
import {
  bookActivity,
  engagement,
  inRange,
  perGameHold,
  perPlayerActivity,
  toCSV,
} from '../analytics.js'
import { analyticsVersion, getAnalyticsRecords, subscribeAnalytics } from '../capture.js'
import './reporting.css'

const DAY = 86_400_000

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '24h', label: '24h', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'all', label: 'All time', days: null },
]

const pct = (n: number): string => `${(n * 100).toFixed(2)}%`

/** Trigger a client-side CSV download (browser only; no server). */
function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Reporting & analytics — read-only operator insight over the durable analytics
 * feed (CLAUDE.md §4, honest by default). Self-contained page; the shell mounts it
 * under Management. Reads the live analytics store; never moves money.
 */
export function ReportingPage() {
  const version = useSyncExternalStore(subscribeAnalytics, analyticsVersion)
  // Snapshot the durable feed; recompute the rollups whenever it grows.
  const all = useMemo(() => getAnalyticsRecords().slice(), [version])

  const [rangeKey, setRangeKey] = useState('7d')
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1]
  const now = Date.now()
  const from = range.days != null ? now - range.days * DAY : 0
  const to = now + 1

  const rows = useMemo(() => inRange(all, from, to), [all, from, to])
  const book = useMemo(() => bookActivity(rows), [rows])
  const games = useMemo(() => perGameHold(rows), [rows])
  const players = useMemo(() => perPlayerActivity(rows), [rows])
  const eng = useMemo(() => engagement(all, now, range.days ?? 30), [all, now, range.days])

  const exportGames = () =>
    downloadCSV(
      `dimebag-game-hold-${rangeKey}.csv`,
      toCSV(
        games.map((g) => ({
          game: g.game,
          bets: g.bets,
          players: g.players,
          turnover_cents: g.turnover,
          house_ggr_cents: g.houseGGR,
          hold_pct: (g.holdPct * 100).toFixed(2),
        })),
      ),
    )

  const exportPlayers = () =>
    downloadCSV(
      `dimebag-players-${rangeKey}.csv`,
      toCSV(
        players.map((p) => ({
          player: p.accountId,
          bets: p.bets,
          turnover_cents: p.turnover,
          net_cents: p.net,
          bonus_cents: p.bonus,
          last_active: new Date(p.lastActive).toISOString(),
        })),
      ),
    )

  const empty = all.length === 0

  return (
    <div className="mgr-report">
      <header className="mgr-report-head">
        <div>
          <h1 className="mgr-report-title">Reporting &amp; analytics</h1>
          <p className="mgr-report-sub">Read-only insight over your book. Figures shown from the house's side.</p>
        </div>
        <div className="mgr-range" role="tablist" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={r.key === rangeKey}
              className={`mgr-range-btn ${r.key === rangeKey ? 'is-on' : ''}`}
              onClick={() => setRangeKey(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {empty ? (
        <p className="mgr-report-empty">
          No activity captured yet. As players wager (and as you grant bonuses), settled rounds stream
          into this report — durably, so you can look back across sessions.
        </p>
      ) : (
        <>
          <section className="mgr-kpis" aria-label="Book summary">
            <Kpi label="Turnover" value={formatMoney(book.turnover)} hint="total staked (handle)" />
            <Kpi label="House GGR" value={formatMoney(book.houseGGR)} tone={book.houseGGR >= 0 ? 'up' : 'down'} hint="gross gaming revenue" />
            <Kpi label="Hold" value={pct(book.holdPct)} hint="GGR ÷ turnover" />
            <Kpi label="Bonus cost" value={formatMoney(book.bonusCost)} hint="free-play granted" />
            <Kpi label="House net" value={formatMoney(book.houseNet)} tone={book.houseNet >= 0 ? 'up' : 'down'} hint="GGR − bonuses" />
            <Kpi label="Players" value={String(book.players)} hint={`${book.bets.toLocaleString()} bets`} />
          </section>

          <section className="mgr-engage" aria-label="Engagement">
            <h2 className="mgr-h2">Engagement <span className="mgr-h2-note">· {range.label.toLowerCase()} window</span></h2>
            <div className="mgr-engage-row">
              <Stat label="Active" value={eng.active} />
              <Stat label="New" value={eng.newPlayers} />
              <Stat label="Returning" value={eng.returning} />
              <Stat label="Dormant" value={eng.dormant} />
              <Stat label="Churned" value={eng.churned} tone="down" />
              <Stat label="Retention" value={pct(eng.retentionPct)} />
            </div>
          </section>

          <section aria-label="Game performance">
            <div className="mgr-tablehead">
              <h2 className="mgr-h2">Game performance &amp; hold</h2>
              <button className="mgr-export" onClick={exportGames} disabled={games.length === 0}>
                Export CSV
              </button>
            </div>
            <table className="mgr-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th className="num">Bets</th>
                  <th className="num">Players</th>
                  <th className="num">Turnover</th>
                  <th className="num">House GGR</th>
                  <th className="num">Hold</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.gameKey}>
                    <td>{g.game}</td>
                    <td className="num">{g.bets.toLocaleString()}</td>
                    <td className="num">{g.players}</td>
                    <td className="num">{formatMoney(g.turnover)}</td>
                    <td className={`num ${g.houseGGR >= 0 ? 'pos' : 'neg'}`}>{formatMoney(g.houseGGR)}</td>
                    <td className="num">{pct(g.holdPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-label="Player activity">
            <div className="mgr-tablehead">
              <h2 className="mgr-h2">Top players by turnover</h2>
              <button className="mgr-export" onClick={exportPlayers} disabled={players.length === 0}>
                Export CSV
              </button>
            </div>
            <table className="mgr-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num">Bets</th>
                  <th className="num">Turnover</th>
                  <th className="num">Player net</th>
                  <th className="num">Bonus</th>
                  <th className="num">Last active</th>
                </tr>
              </thead>
              <tbody>
                {players.slice(0, 50).map((p) => (
                  <tr key={p.accountId}>
                    <td>{p.accountId}</td>
                    <td className="num">{p.bets.toLocaleString()}</td>
                    <td className="num">{formatMoney(p.turnover)}</td>
                    <td className={`num ${p.net >= 0 ? 'pos' : 'neg'}`}>{formatMoney(p.net)}</td>
                    <td className="num">{p.bonus > 0 ? formatMoney(p.bonus) : '—'}</td>
                    <td className="num mgr-dim">{relativeTime(now - p.lastActive)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'up' | 'down' }) {
  return (
    <div className={`mgr-kpi ${tone ? `is-${tone}` : ''}`}>
      <span className="mgr-kpi-label">{label}</span>
      <span className="mgr-kpi-value">{value}</span>
      {hint && <span className="mgr-kpi-hint">{hint}</span>}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'down' }) {
  return (
    <div className={`mgr-stat ${tone ? `is-${tone}` : ''}`}>
      <span className="mgr-stat-value">{value}</span>
      <span className="mgr-stat-label">{label}</span>
    </div>
  )
}

function relativeTime(ms: number): string {
  if (ms < 60_000) return 'just now'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
