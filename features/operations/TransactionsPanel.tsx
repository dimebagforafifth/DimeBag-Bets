/**
 * Transactions — the operator's REAL transaction ledger over the DURABLE book
 * (app/book-ledger, built on the generic ledger/ module, persisted so it survives a
 * reload). Unlike the old adapter (which wrapped the session-only casino feed), this
 * analyses the canonical record of every money movement: placements, grades,
 * settlements, and audited manual adjustments — newest first, across the whole book.
 *
 * Read-only by contract: it moves NO money and touches no core/org state. It only
 * shapes the durable ledger into a searchable, filterable, exportable operator view.
 * An operator can scope by player, kind, outcome, and a time window, watch a live
 * matched-row count, and pull the filtered set as a CSV for offline analysis.
 *
 * Coins-only: every figure renders through a local coins formatter (never the
 * "$"-marked formatMoney() — a points book shows no currency mark; CLAUDE.md §1).
 * Wrapped in <PanelShell> per the operations-panel contract (so .feat-panel exists and
 * Escape→onBack works). Reactive via useSyncExternalStore over the durable ledger (for
 * movements) and the book (for the accountId→name map).
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  getBookLedger,
  subscribeBookLedger,
  getBookLedgerVersion,
} from '../../app/book-ledger.js'
import { getBook, subscribeBook, getBookVersion } from '../../app/book-store.js'
import type { LedgerEntry, LedgerKind } from '../../ledger/index.js'
import type { Outcome } from '../../core/index.js'
import { PanelShell } from './shared.js'
import './transactions.css'

type KindFilter = 'all' | LedgerKind
type OutcomeFilter = 'all' | Outcome
/** A player id, or 'all'. */
type PlayerFilter = string
/** Rolling time windows (ms), or 'all' for the full durable history. */
type WindowFilter = 'all' | '24h' | '7d' | '30d'

const WINDOW_MS: Record<Exclude<WindowFilter, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

const KIND_LABEL: Record<LedgerKind, string> = {
  place: 'Placed',
  resolve: 'Graded',
  settle: 'Settled',
  adjust: 'Adjusted',
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  win: 'Won',
  loss: 'Lost',
  push: 'Push',
  void: 'Void',
}

export function TransactionsPanel({ onBack }: { onBack: () => void }) {
  // The durable book ledger, newest-first (stable ref between movements).
  const entries = useSyncExternalStore(subscribeBookLedger, getBookLedger, getBookLedger)
  // Re-derive the names map when the book changes (a player could be renamed even when
  // no new movement has landed).
  const bookVersion = useSyncExternalStore(subscribeBook, getBookVersion, getBookVersion)
  // Bump filter recomputation in lockstep with the ledger snapshot id.
  useSyncExternalStore(subscribeBookLedger, getBookLedgerVersion, getBookLedgerVersion)

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [outcome, setOutcome] = useState<OutcomeFilter>('all')
  const [player, setPlayer] = useState<PlayerFilter>('all')
  const [windowF, setWindowF] = useState<WindowFilter>('all')

  // accountId → display name, from the live book.
  const names = useMemo(() => {
    const map = new Map<string, string>()
    const members = getBook().members
    for (const id of Object.keys(members)) {
      const m = members[id]
      map.set(id, m.profile?.nickname || m.name)
    }
    return map
  }, [bookVersion])

  // Players that actually appear in the ledger → the player-filter options
  // (id + label), stable first-seen order, newest-first source so active players lead.
  const players = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of entries) {
      if (!seen.has(e.accountId)) seen.set(e.accountId, nameOf(names, e.accountId))
    }
    return [...seen].map(([value, label]) => ({ value, label }))
  }, [entries, names])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cutoff = windowF === 'all' ? 0 : Date.now() - WINDOW_MS[windowF]
    return entries.filter((e) => {
      if (kind !== 'all' && e.kind !== kind) return false
      if (outcome !== 'all' && e.outcome !== outcome) return false
      if (player !== 'all' && e.accountId !== player) return false
      if (cutoff && e.at < cutoff) return false
      if (q && !nameOf(names, e.accountId).toLowerCase().includes(q)) return false
      return true
    })
  }, [entries, query, kind, outcome, player, windowF, names])

  const stats = useMemo(() => summarize(filtered), [filtered])

  const exportCsv = () => downloadCsv(filtered, names)

  return (
    <PanelShell onBack={onBack}>
      {/* ---- analysis summary strip ---- */}
      <section className="tx-summary" aria-label="Ledger summary">
        <Stat label="Entries" value={stats.entries.toLocaleString('en-US')} />
        <Stat label="Wagered" value={coins(stats.wagered)} />
        <Stat
          label="Net figure"
          value={signedCoins(stats.net)}
          tone={stats.net > 0 ? 'up' : stats.net < 0 ? 'down' : undefined}
        />
        <Stat label="Graded" value={String(stats.kinds.resolve)} />
        <Stat label="Settled" value={String(stats.kinds.settle)} />
        <Stat label="Adjusted" value={String(stats.kinds.adjust)} />
        <Stat
          label="Wins / Losses"
          value={`${stats.wins.toLocaleString('en-US')} / ${stats.losses.toLocaleString('en-US')}`}
        />
      </section>

      {/* ---- sticky filter header ---- */}
      <header className="tx-head">
        <input
          className="tx-search"
          type="search"
          placeholder="Search by player…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search by player name"
        />

        <div className="tx-filters" role="group" aria-label="Filter transactions">
          <label className="tx-field">
            <span className="tx-field-label">Player</span>
            <select
              className="tx-select"
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
            >
              <option value="all">All players</option>
              {players.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="tx-field">
            <span className="tx-field-label">Kind</span>
            <select
              className="tx-select"
              value={kind}
              onChange={(e) => setKind(e.target.value as KindFilter)}
            >
              <option value="all">All kinds</option>
              <option value="resolve">Graded</option>
              <option value="settle">Settled</option>
              <option value="adjust">Adjusted</option>
            </select>
          </label>

          <label className="tx-field">
            <span className="tx-field-label">Outcome</span>
            <select
              className="tx-select"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as OutcomeFilter)}
            >
              <option value="all">All outcomes</option>
              <option value="win">Won</option>
              <option value="loss">Lost</option>
              <option value="push">Push</option>
              <option value="void">Void</option>
            </select>
          </label>

          <label className="tx-field">
            <span className="tx-field-label">Window</span>
            <select
              className="tx-select"
              value={windowF}
              onChange={(e) => setWindowF(e.target.value as WindowFilter)}
            >
              <option value="all">All time</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
        </div>

        <span className="tx-spacer" />

        <span className="tx-count" aria-live="polite">
          {filtered.length.toLocaleString('en-US')}{' '}
          {filtered.length === 1 ? 'entry' : 'entries'}
        </span>
        <button
          type="button"
          className="feat-btn tx-export"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          Download CSV
        </button>
      </header>

      {/* ---- rows ---- */}
      {entries.length === 0 ? (
        <p className="feat-empty">
          No transactions yet — bets, settlements and adjustments appear here as they
          post to the book.
        </p>
      ) : filtered.length === 0 ? (
        <p className="feat-empty">No transactions match these filters.</p>
      ) : (
        <div className="tx-table" role="table" aria-label="Transactions">
          <div className="tx-row tx-row-head" role="row">
            <span role="columnheader">Time</span>
            <span role="columnheader">Player</span>
            <span role="columnheader">Kind</span>
            <span role="columnheader">Outcome</span>
            <span className="tx-num" role="columnheader">
              Figure Δ
            </span>
            <span role="columnheader">Detail</span>
          </div>
          {filtered.map((e) => (
            <Row key={e.seq} e={e} name={nameOf(names, e.accountId)} />
          ))}
        </div>
      )}
    </PanelShell>
  )
}

/** One durable-ledger row: time, player, kind, outcome (colored), signed coin delta,
 *  and the actor + reason for manual adjust/settle movements. */
function Row({ e, name }: { e: LedgerEntry; name: string }) {
  const tone = e.balanceDelta > 0 ? 'is-up' : e.balanceDelta < 0 ? 'is-down' : 'is-flat'
  const oTone =
    e.outcome === 'win' ? 'is-up' : e.outcome === 'loss' ? 'is-down' : undefined

  return (
    <div className="tx-row" role="row">
      <span className="tx-time" role="cell">
        {formatTime(e.at)}
      </span>
      <span className="tx-who" role="cell">
        {name}
      </span>
      <span className={`tx-kind tx-kind-${e.kind}`} role="cell">
        {KIND_LABEL[e.kind]}
      </span>
      <span className={`tx-outcome ${oTone ?? ''}`} role="cell">
        {e.outcome ? OUTCOME_LABEL[e.outcome] : '—'}
      </span>
      <span className={`tx-num tx-delta ${tone}`} role="cell">
        {e.balanceDelta === 0 ? '—' : signedCoins(e.balanceDelta)}
      </span>
      <span className="tx-detail" role="cell">
        {detailOf(e)}
      </span>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'up' | 'down'
}) {
  return (
    <div className="tx-stat">
      <span className="tx-stat-label">{label}</span>
      <span className={`tx-stat-value ${tone ? `is-${tone}` : ''}`}>{value}</span>
    </div>
  )
}

/* ------------------------------- analysis ------------------------------- */

interface TxStats {
  entries: number
  wagered: number
  net: number
  wins: number
  losses: number
  kinds: Record<LedgerKind, number>
}

/** Roll the filtered durable entries into the summary strip's figures. Pure.
 *  The durable book ledger records no standalone 'place' row — a bet first appears on
 *  its 'resolve', which releases the hold with pendingDelta = -stake. So graded turnover
 *  (Wagered) is the sum of -pendingDelta over resolves; net is the sum of balanceDelta
 *  across every movement; win/loss come from resolve outcomes. */
function summarize(entries: LedgerEntry[]): TxStats {
  const kinds: Record<LedgerKind, number> = { place: 0, resolve: 0, settle: 0, adjust: 0 }
  let wagered = 0
  let net = 0
  let wins = 0
  let losses = 0
  for (const e of entries) {
    kinds[e.kind] += 1
    net += e.balanceDelta
    if (e.kind === 'resolve') {
      wagered += -e.pendingDelta // the stake that was at risk, released on grade
      if (e.outcome === 'win') wins += 1
      else if (e.outcome === 'loss') losses += 1
    }
  }
  return { entries: entries.length, wagered, net, wins, losses, kinds }
}

/* -------------------------------- helpers ------------------------------- */

function nameOf(names: Map<string, string>, accountId: string): string {
  return names.get(accountId) ?? accountId
}

/** The human-readable detail for a row: actor + reason on a manual movement
 *  (adjust/settle carry the audit trail); the game name on a graded bet; else blank. */
function detailOf(e: LedgerEntry): string {
  if (e.reason || e.actor) {
    const who = e.actor ? `${e.actor}` : ''
    const why = e.reason ? e.reason : ''
    return [who, why].filter(Boolean).join(' · ')
  }
  const meta = e.meta ?? {}
  if (typeof meta.gameName === 'string') return meta.gameName
  if (typeof meta.game === 'string') return meta.game
  return ''
}

function formatTime(at: number): string {
  return new Date(at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** A plain coin amount (no sign, no currency mark) — 2dp, grouped. */
function coins(cents: number): string {
  return `${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} coins`
}

/** A signed coin amount (+ on a gain, − on a loss) — never formatMoney()'s "$"
 *  mark; a points-only book shows no currency symbol (CLAUDE.md §1, console brief). */
function signedCoins(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : ''
  const num = (Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}${num} coins`
}

/* -------------------------------- export -------------------------------- */

/** Build a CSV of the filtered rows and trigger a client-side Blob download, so the
 *  operator can pull the book for offline analysis. Coins (2dp) for amounts. */
function downloadCsv(entries: LedgerEntry[], names: Map<string, string>): void {
  const header = [
    'seq',
    'time',
    'player',
    'accountId',
    'kind',
    'outcome',
    'balanceDelta(coins)',
    'pendingDelta(coins)',
    'balanceAfter(coins)',
    'actor',
    'reason',
    'detail',
  ]
  const lines = [header.map(csvCell).join(',')]
  for (const e of entries) {
    lines.push(
      [
        String(e.seq),
        new Date(e.at).toISOString(),
        nameOf(names, e.accountId),
        e.accountId,
        e.kind,
        e.outcome ?? '',
        (e.balanceDelta / 100).toFixed(2),
        (e.pendingDelta / 100).toFixed(2),
        (e.balanceAfter / 100).toFixed(2),
        e.actor ?? '',
        e.reason ?? '',
        detailOf(e),
      ]
        .map(csvCell)
        .join(','),
    )
  }
  const csv = lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** RFC-4180 cell: wrap in quotes and double any embedded quote when the value holds a
 *  comma, quote, or newline. */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
