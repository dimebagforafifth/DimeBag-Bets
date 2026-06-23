/**
 * Weekly Sheet — the DEEP per-player by-day dollar win/loss view (CLAUDE.md §3/§4).
 *
 * A player's running figure is their core `account.balance` (dollars won/lost this
 * period); the per-day breakdown is summed from the read-only analytics feed
 * (manager/reporting). The book figure is the inverse sum of every player figure.
 *
 * The ONLY money action is a whole-book BULK settle through the sanctioned
 * settleAndRecord wrapper (app/settlement-store) behind a confirm gate. Per-player
 * one-tap settle is intentionally read-only (no core primitive exists — see SEAM).
 * Everything else here is derived, read-only, and shown with formatMoney — dollars,
 * never real money.
 */
import { Fragment, useMemo, useState, useSyncExternalStore } from 'react'
import { agentOf, type Member } from '../org/index.js'
import {
  getAnalyticsRecords,
  subscribeAnalytics,
  analyticsVersion,
} from '../../manager/reporting/index.js'
import { settleAndRecord } from '../../app/settlement-store.js'
import { getBookVersion } from '../../app/book-store.js'
import { PanelShell, useBook, Figure, ChipBar, Tabs, downloadFile } from '../_desk/shared.js'
import { dayWindows, dayNet, rowsToCsv } from '../_desk/data.js'
import { ScopeBar, scopedPlayers, ALL_SCOPE } from '../_desk/scope.js'
import { InfoDot } from '../_desk/Tooltip.js'

interface SheetRow {
  id: string
  name: string
  figure: number
  exposure: number
  byDay: number[]
  agent: Member | null
}

interface AgentGroup {
  key: string
  label: string
  players: SheetRow[]
  byDay: number[]
  figure: number
}

type FilterKey = 'all' | 'balance' | 'owes' | 'owed'
type SortKey = 'figure' | 'exposure'

const FILTERS: ReadonlyArray<{ value: FilterKey; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'balance', label: 'With a balance' },
  { value: 'owes', label: 'Owes' },
  { value: 'owed', label: 'Owed' },
]

const SORTS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'figure', label: 'By figure' },
  { value: 'exposure', label: 'By exposure' },
]

const matchesFilter = (figure: number, f: FilterKey): boolean => {
  switch (f) {
    case 'all':
      return true
    case 'balance':
      return figure !== 0
    case 'owes':
      return figure < 0
    case 'owed':
      return figure > 0
  }
}

const settleDirection = (figure: number): string =>
  figure > 0 ? 'Pay player' : figure < 0 ? 'Collect' : 'Even'

export function WeeklySheetPanel({ onBack }: { onBack: () => void }) {
  // Re-render on every figure move (book) AND every settled wager (analytics).
  const book = useBook()
  const av = useSyncExternalStore(subscribeAnalytics, analyticsVersion)

  const [scope, setScope] = useState(ALL_SCOPE)
  const [grouped, setGrouped] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>('figure')
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState<{ count: number; net: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const view = useMemo(() => {
    const records = getAnalyticsRecords()
    const nowMs = Date.now()
    const days = dayWindows(nowMs, 7)

    const players: SheetRow[] = scopedPlayers(book, scope).map((m) => {
      const figure = m.account.balance
      const exposure = m.account.pending
      const byDay = days.map((d) => dayNet(records, m.id, d.start, d.end))
      return { id: m.id, name: m.name, figure, exposure, byDay, agent: agentOf(book, m.id) }
    })

    // A positive player figure means the book owes them → the book is down by that
    // much. Book figure = the inverse sum of every player figure.
    const bookFigure = players.reduce((s, p) => s - p.figure, 0)
    const playersUp = players.filter((p) => p.figure > 0).length
    const playersDown = players.filter((p) => p.figure < 0).length
    const totalExposure = players.reduce((s, p) => s + p.exposure, 0)

    return { days, players, bookFigure, playersUp, playersDown, totalExposure }
    // av/getBookVersion drive the re-render; keep both in the dep list.
  }, [book, av, scope, getBookVersion()])

  const rows = useMemo(() => {
    const filtered = view.players.filter((p) => matchesFilter(p.figure, filter))
    const sorted = [...filtered].sort((a, b) =>
      sort === 'figure' ? b.figure - a.figure : b.exposure - a.exposure,
    )
    return sorted
  }, [view, filter, sort])

  // Per-agent grouping: bucket the rows under their agent (master agents roll up their
  // agents' players too, via agentOf's nearest-agent rule) with a subtotal per group.
  const groups = useMemo<AgentGroup[]>(() => {
    const byKey = new Map<string, AgentGroup>()
    for (const p of rows) {
      const key = p.agent?.id ?? '__direct'
      let g = byKey.get(key)
      if (!g) {
        g = {
          key,
          label: p.agent ? p.agent.name : 'Direct (under manager)',
          players: [],
          byDay: view.days.map(() => 0),
          figure: 0,
        }
        byKey.set(key, g)
      }
      g.players.push(p)
      g.figure += p.figure
      p.byDay.forEach((n, i) => (g!.byDay[i] += n))
    }
    // Agents first (alpha), the manager-direct bucket last.
    return [...byKey.values()].sort((a, b) =>
      a.key === '__direct' ? 1 : b.key === '__direct' ? -1 : a.label.localeCompare(b.label),
    )
  }, [rows, view.days])

  const playerRow = (p: SheetRow) => (
    <tr key={p.id}>
      <td className="mdsk-player">{p.name}</td>
      {p.byDay.map((net, i) => (
        <td key={view.days[i].iso} className="num">
          {net === 0 ? '—' : <Figure cents={net} />}
        </td>
      ))}
      <td className={`num ${p.figure < 0 ? 'feat-down' : p.figure > 0 ? 'feat-up' : ''}`}>
        <Figure cents={p.figure} />
      </td>
      {/* Per-player one-tap settle stays read-only (only whole-book settleAndRecord exists). */}
      <td className="feat-label">{settleDirection(p.figure)}</td>
    </tr>
  )

  const runSettle = () => {
    setError(null)
    try {
      // ONLY money action. Throws if any wager is still pending (pending guard).
      const rec = settleAndRecord(Date.now(), false)
      setDone({ count: rec.lines.length, net: rec.net })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setConfirming(false)
  }

  const exportCsv = () => {
    const columns = ['agent', 'player', ...view.days.map((d) => d.iso), 'weeklyTotal', 'status']
    const csvRows = rows.map((p) => {
      const row: Record<string, string | number> = {
        agent: p.agent?.name ?? 'Direct',
        player: p.name,
        weeklyTotal: p.figure,
        status: settleDirection(p.figure),
      }
      view.days.forEach((d, i) => {
        row[d.iso] = p.byDay[i]
      })
      return row
    })
    downloadFile('weekly-sheet.csv', rowsToCsv(csvRows, columns))
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Per-player dollars won and lost, broken out by day for the last week and rolled up
          under each agent, with the book&apos;s running figure. Settle squares up the whole
          book at once.
        </p>
      </header>

      <ScopeBar org={book} value={scope} onChange={setScope} />

      <section className="feat-kpis" aria-label="Weekly sheet summary">
        <div className="feat-kpi">
          <span className="feat-label">
            Book figure <InfoDot id="book-figure" />
          </span>
          <strong className={view.bookFigure < 0 ? 'feat-down' : 'feat-up'}>
            <Figure cents={view.bookFigure} />
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Players up</span>
          <strong>{view.playersUp}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Players down</span>
          <strong>{view.playersDown}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">
            Total exposure <InfoDot id="exposure" />
          </span>
          <strong>
            <Figure cents={view.totalExposure} plus={false} />
          </strong>
        </div>
      </section>

      <div className="mdsk-toolbar">
        <ChipBar value={filter} options={FILTERS} onChange={setFilter} label="Filter players" />
        <Tabs value={sort} options={SORTS} onChange={setSort} label="Sort players" />
        <button
          className={`feat-btn ${grouped ? 'is-primary' : ''}`}
          onClick={() => setGrouped((g) => !g)}
          aria-pressed={grouped}
        >
          {grouped ? 'Grouped by agent' : 'Group by agent'}
        </button>
        <button className="feat-btn" onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="feat-empty">No players match this filter.</p>
      ) : (
        <div className="mdsk-scroll">
          <table className="feat-table" aria-label="Weekly sheet">
            <thead>
              <tr>
                <th>Player</th>
                {view.days.map((d) => (
                  <th key={d.iso} className="num">
                    {d.label}
                  </th>
                ))}
                <th className="num">
                  Weekly total <InfoDot id="figure" />
                </th>
                <th>
                  Settle <InfoDot id="owed" />
                </th>
              </tr>
            </thead>
            <tbody>
              {grouped
                ? groups.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="mdsk-group">
                        <td>
                          {g.label} <span className="mdsk-group-n">· {g.players.length}</span>
                        </td>
                        {g.byDay.map((net, i) => (
                          <td key={view.days[i].iso} className="num">
                            {net === 0 ? '—' : <Figure cents={net} />}
                          </td>
                        ))}
                        <td
                          className={`num ${g.figure < 0 ? 'feat-down' : g.figure > 0 ? 'feat-up' : ''}`}
                        >
                          <Figure cents={g.figure} />
                        </td>
                        <td className="feat-label">{settleDirection(g.figure)}</td>
                      </tr>
                      {g.players.map(playerRow)}
                    </Fragment>
                  ))
                : rows.map(playerRow)}
            </tbody>
          </table>
        </div>
      )}

      <section className="feat-card" aria-label="Settle the book">
        <p className="feat-sub">
          Period settlement <InfoDot id="settle" />
        </p>
        {/* SEAM: "settle = leaderboard season reset" is not wired — vip-store leaderboard ranks by LIFETIME wagered and no settle path resets it. Needs a vip-store resetSeason() called from the settle flow. */}
        {!confirming ? (
          <button className="feat-btn feat-btn-primary" onClick={() => setConfirming(true)}>
            Settle all…
          </button>
        ) : (
          <div className="feat-actions">
            <span className="feat-sub">
              This records the sheet and resets every figure to zero across the whole book.
              Confirm?
            </span>
            <button className="feat-btn feat-btn-primary" onClick={runSettle}>
              Yes, settle now
            </button>
            <button className="feat-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        )}

        {done && (
          <p className="feat-saved">
            Settled {done.count} account{done.count === 1 ? '' : 's'} · book net{' '}
            <Figure cents={done.net} /> · figures reset to zero.
          </p>
        )}
        {error && <p className="feat-empty feat-down">{error}</p>}
      </section>
    </PanelShell>
  )
}
