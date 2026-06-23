/**
 * The Profile surface — a player's permanent, verified, braggable record.
 *
 * READ-ONLY: it renders a VerifiedRecord (a projection of settled activity) and lets you view
 * any player's public profile. No control here moves money or mutates anything. Presentation
 * consumes the global design tokens (app/theme.css); // SEAM markers flag spots Agent D may
 * want to polish further.
 */

import { useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { getCurrentPlayerId } from '../../../app/book-store.js'
import { formatMoney } from '../../../games/shared/money.js'
import { shareableSummary } from '../share.js'
import { getRecord, getRecordsVersion, listProfilePlayers, subscribeRecords } from '../store.js'
import type { BetHighlight, PeriodStats, RecordBadge, VerifiedRecord } from '../types.js'
import './records.css'

type Period = 'lifetime' | 'month' | 'week' | 'day'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'lifetime', label: 'Lifetime' },
  { key: 'month', label: '30d' },
  { key: 'week', label: '7d' },
  { key: 'day', label: '24h' },
]

const pct = (fraction: number) => `${fraction >= 0 ? '+' : ''}${(fraction * 100).toFixed(1)}%`
const moneyTone = (cents: number) => (cents > 0 ? 'is-up' : cents < 0 ? 'is-down' : 'is-even')
// Prefix positive directional amounts with "+" so profit/loss reads in TEXT, not colour alone
// (WCAG 1.4.1 — formatMoney already renders "−" for negatives).
const signed = (cents: number) => (cents > 0 ? `+${formatMoney(cents)}` : formatMoney(cents))

export function ProfileSection(): ReactNode {
  // Re-render whenever the ledger or book changes; the record is then a fresh read below.
  useSyncExternalStore(subscribeRecords, getRecordsVersion, getRecordsVersion)
  const [picked, setPicked] = useState<string | null>(null)
  const now = Date.now() // live, so period windows stay current as bets settle
  const players = listProfilePlayers()
  // Only honour `picked` if that player still exists (roster/seed can change); else fall back.
  const validPick = picked && players.some((p) => p.id === picked) ? picked : null
  const viewId = validPick ?? getCurrentPlayerId() ?? players[0]?.id ?? null
  const record = viewId ? getRecord(viewId, now) : null

  if (!record) {
    return (
      <section className="records">
        <div className="records-empty">No player to show a record for yet.</div>
      </section>
    )
  }

  return (
    <section className="records">
      <RecordHeader record={record} players={players} viewId={viewId} onPick={setPicked} />
      <RecordBody record={record} />
    </section>
  )
}

function RecordHeader({
  record,
  players,
  viewId,
  onPick,
}: {
  record: VerifiedRecord
  players: { id: string; name: string }[]
  viewId: string
  onPick: (id: string) => void
}) {
  const t = record.tier
  return (
    <header className="records-head">
      <div className="records-id">
        <span className="records-tier" style={{ '--rank': t.current.color } as CSSProperties}>
          {t.current.id === 'none' ? 'Unranked' : t.current.name}
        </span>
        <h1 className="records-name">{record.name}</h1>
        <span
          className="records-verified verify-ok"
          title="Derived only from settled, audited bets"
        >
          ✓ Verified record
        </span>
        {record.integrity.demoSeeded && <span className="records-demo">demo data</span>}
      </div>

      <div className="records-head-right">
        {players.length > 1 && (
          <select
            className="records-switch"
            value={viewId}
            onChange={(e) => onPick(e.target.value)}
            aria-label="View a player's profile"
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <ShareButton record={record} />
      </div>

      {t.next && (
        <div className="records-tierbar" title={`${formatMoney(t.remaining)} to ${t.next.name}`}>
          <div className="records-tierbar-fill" style={{ width: `${Math.round(t.pct * 100)}%` }} />
        </div>
      )}
    </header>
  )
}

function RecordBody({ record }: { record: VerifiedRecord }) {
  const [period, setPeriod] = useState<Period>('lifetime')
  const stats = period === 'lifetime' ? record.lifetime : record.periods[period]

  return (
    <div className="records-body">
      <div className="records-periods">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            className={`chip ${period === p.key ? 'is-on' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <StatGrid stats={stats} />

      <div className="records-cards">
        <StreakCard record={record} />
        <HighlightCard label="Biggest win" hl={record.biggestWin} />
        <HighlightCard label="Biggest loss" hl={record.biggestLoss} />
        <ClvCard record={record} />
      </div>

      {record.badges.length > 0 && (
        <div className="records-section">
          <h2 className="records-h2">Badges</h2>
          <BadgeRow badges={record.badges} />
        </div>
      )}

      <div className="records-split">
        <SideCard title="Casino" stats={record.side.casino} />
        <SideCard title="Sportsbook" stats={record.side.sportsbook} />
      </div>

      {record.byGame.length > 0 && (
        <div className="records-section">
          <h2 className="records-h2">By game</h2>
          <ByGameTable record={record} />
        </div>
      )}

      {record.recentBets.length > 0 && (
        <div className="records-section">
          <h2 className="records-h2">Recent results</h2>
          <RecentList bets={record.recentBets} />
        </div>
      )}

      <p className="records-integrity">
        Every figure is derived from {record.integrity.entriesConsidered} settled, audited bets —
        never hand-entered. Fingerprint <code>{record.integrity.fingerprint.slice(0, 12)}</code>.
      </p>
    </div>
  )
}

function StatGrid({ stats }: { stats: PeriodStats }) {
  return (
    <div className="records-stats">
      <StatCell label="Net" value={signed(stats.net)} tone={moneyTone(stats.net)} big />
      <StatCell label="ROI" value={pct(stats.roi)} tone={moneyTone(stats.net)} big />
      <StatCell label="Record" value={`${stats.wins}–${stats.losses}`} />
      <StatCell label="Win rate" value={`${stats.winRate.toFixed(0)}%`} />
      <StatCell label="Wagered" value={formatMoney(stats.wagered)} />
      <StatCell label="Bets" value={String(stats.bets)} />
    </div>
  )
}

function StatCell({
  label,
  value,
  tone,
  big,
}: {
  label: string
  value: string
  tone?: string
  big?: boolean
}) {
  return (
    <div className={`stat${big ? ' is-big' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ?? ''}`}>{value}</span>
    </div>
  )
}

function StreakCard({ record }: { record: VerifiedRecord }) {
  const s = record.streak
  const live =
    s.currentKind === 'none' ? '—' : `${s.current} ${s.currentKind}${s.current === 1 ? '' : 's'}`
  return (
    <div className="records-card">
      <span className="records-card-label">Current streak</span>
      <span
        className={`records-card-value ${s.currentKind === 'win' ? 'is-up' : s.currentKind === 'loss' ? 'is-down' : ''}`}
      >
        {live}
      </span>
      <span className="records-card-sub">
        best {s.longestWin}W · {s.longestLoss}L
      </span>
    </div>
  )
}

function HighlightCard({ label, hl }: { label: string; hl: BetHighlight | null }) {
  return (
    <div className="records-card">
      <span className="records-card-label">{label}</span>
      {hl ? (
        <>
          <span className={`records-card-value ${moneyTone(hl.profit)}`}>{signed(hl.profit)}</span>
          <span className="records-card-sub">
            {hl.game}
            {hl.multiplier > 1 ? ` · ${Number(hl.multiplier.toFixed(2))}×` : ''}
          </span>
        </>
      ) : (
        <span className="records-card-value is-even">—</span>
      )}
    </div>
  )
}

function ClvCard({ record }: { record: VerifiedRecord }) {
  const c = record.clv
  return (
    <div className="records-card">
      <span className="records-card-label">Beats the close (CLV)</span>
      {c.available ? (
        <>
          <span className={`records-card-value ${c.beatRate >= 50 ? 'is-up' : 'is-down'}`}>
            {c.beatRate.toFixed(0)}%
          </span>
          <span className="records-card-sub">
            {pct(c.avgClvPct / 100)} avg · {c.sampleSize} priced bets
          </span>
        </>
      ) : (
        <>
          <span className="records-card-value is-even">n/a</span>
          {/* SEAM: gated honestly until server-side closing-line capture lands. */}
          <span className="records-card-sub">{c.note}</span>
        </>
      )}
    </div>
  )
}

function SideCard({ title, stats }: { title: string; stats: PeriodStats }) {
  return (
    <div className="records-side">
      <span className="records-side-title">{title}</span>
      <span className={`records-side-net ${moneyTone(stats.net)}`}>{signed(stats.net)}</span>
      <span className="records-side-sub">
        {stats.bets} bets · {stats.winRate.toFixed(0)}% · {pct(stats.roi)} ROI
      </span>
    </div>
  )
}

function ByGameTable({ record }: { record: VerifiedRecord }) {
  const rows = record.byGame
    .slice()
    .sort((a, b) => b.wagered - a.wagered)
    .slice(0, 8)
  return (
    <div className="records-table">
      <div className="records-row is-head">
        <span>Game</span>
        <span>Bets</span>
        <span>Wagered</span>
        <span>Net</span>
      </div>
      {rows.map((g) => (
        <div className="records-row" key={g.key}>
          <span>{g.name}</span>
          <span>{g.bets}</span>
          <span>{formatMoney(g.wagered)}</span>
          <span className={moneyTone(g.net)}>{signed(g.net)}</span>
        </div>
      ))}
    </div>
  )
}

function RecentList({ bets }: { bets: BetHighlight[] }) {
  return (
    <div className="records-recent">
      {bets.map((b) => (
        <div className="records-recent-row" key={b.id}>
          <span className="records-recent-game">{b.game}</span>
          <span className={`records-result is-${b.outcome}`}>{b.outcome}</span>
          <span className={`records-recent-profit ${moneyTone(b.profit)}`}>{signed(b.profit)}</span>
        </div>
      ))}
    </div>
  )
}

function BadgeRow({ badges }: { badges: RecordBadge[] }) {
  return (
    <div className="records-badges">
      {badges.map((b) => (
        <div className={`records-badge tone-${b.tone}`} key={b.id} title={b.detail}>
          <span className="records-badge-label">{b.label}</span>
          <span className="records-badge-detail">{b.detail}</span>
        </div>
      ))}
    </div>
  )
}

function ShareButton({ record }: { record: VerifiedRecord }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!navigator.clipboard) return // no Clipboard API (headless/restricted) — don't fake success
    try {
      await navigator.clipboard.writeText(shareableSummary(record))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // write rejected (permission etc.) — no-op
    }
  }
  return (
    <button className="action records-share" onClick={copy}>
      {copied ? 'Copied ✓' : 'Share record'}
    </button>
  )
}
