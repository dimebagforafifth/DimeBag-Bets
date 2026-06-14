/**
 * Leaderboards sub-view — competitive balance/status boards. The player picks a board
 * (Top Profit / Top Volume / Win Streak / Closing-Line Value), a period, and a scope
 * (Global vs Friends), then sees the standings with the balance prizes top finishers earn
 * and their own rank surfaced up top. Balance & status only — never cash.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import {
  BOARDS,
  PERIODS,
  PERIOD_LABEL,
  boardRows,
  boardValue,
  fmt,
  type BoardId,
  type Period,
  type Scope,
  type RewardsApi,
} from './data.js'
import { Globe, Users } from 'lucide-react'

const SCOPES: { id: Scope; name: string; icon: typeof Globe }[] = [
  { id: 'global', name: 'Global', icon: Globe },
  { id: 'friends', name: 'Friends', icon: Users },
]

export function LeaderboardsView({ api }: { api: RewardsApi }) {
  const [board, setBoard] = useState<BoardId>('profit')
  const [period, setPeriod] = useState<Period>('weekly')
  const [scope, setScope] = useState<Scope>('global')

  const boardDef = useMemo(() => BOARDS.find((b) => b.id === board) ?? BOARDS[0], [board])
  const rows = useMemo(
    () => boardRows(board, period, scope, api.playerName),
    [board, period, scope, api.playerName],
  )
  const you = rows.find((r) => r.isYou)

  return (
    <>
      <div className="rw-head">
        <h2 className="rw-h2" style={{ margin: 0 }}>
          Leaderboards
        </h2>
        <span className="rw-sub" style={{ margin: 0 }}>
          Compete for prizes &amp; status
        </span>
      </div>

      {/* ── controls ───────────────────────────────────────────── */}
      <div className="rw-chips" role="group" aria-label="Choose a leaderboard">
        {BOARDS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`rw-chip${b.id === board ? ' is-on' : ''}`}
            aria-pressed={b.id === board}
            onClick={() => setBoard(b.id)}
          >
            <b.icon aria-hidden="true" />
            {b.name}
          </button>
        ))}
      </div>

      <div
        className="rw-chips"
        role="group"
        aria-label="Choose a time period"
        style={{ marginTop: 8 }}
      >
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            className={`rw-chip${p === period ? ' is-on' : ''}`}
            aria-pressed={p === period}
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      <div
        className="rw-chips"
        role="group"
        aria-label="Choose a scope"
        style={{ marginTop: 8 }}
      >
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`rw-chip${s.id === scope ? ' is-on' : ''}`}
            aria-pressed={s.id === scope}
            onClick={() => setScope(s.id)}
          >
            <s.icon aria-hidden="true" />
            {s.name}
          </button>
        ))}
      </div>

      {boardDef.id === 'clv' && (
        <p className="rw-sub">
          Closing-Line Value is your average price vs. the line at close — straight from
          the book&apos;s CLV data. Higher is sharper.
        </p>
      )}

      {/* ── your standing banner ───────────────────────────────── */}
      {you && (
        <section
          className="rw-hero"
          style={{ ['--accent' as string]: 'var(--gold)' } as CSSProperties}
          aria-label="Your standing"
        >
          <div className="rw-hero-emblem">
            <boardDef.icon aria-hidden="true" />
          </div>
          <div className="rw-hero-body">
            <div className="rw-head">
              <span className="rw-h2" style={{ margin: 0 }}>
                You&apos;re #{you.rank}
              </span>
              <span className="rw-pill is-gold">
                {boardDef.name} · {PERIOD_LABEL[period]}
              </span>
            </div>
            <span className="rw-sub" style={{ margin: 0 }}>
              {boardValue(boardDef, you.value)} ·{' '}
              {scope === 'friends' ? 'Among friends' : 'Global'}
            </span>
          </div>
          <span className="rw-coins">
            {you.prize > 0 ? `+${fmt(you.prize)}` : '—'}
          </span>
        </section>
      )}

      {/* ── standings table ────────────────────────────────────── */}
      <section className="rw-card" aria-label={`${boardDef.name} leaderboard`}>
        <table className="rw-table">
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col" className="num">
                {boardDef.name}
              </th>
              <th scope="col" className="num">
                Prize
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rank} className={row.isYou ? 'is-you' : undefined}>
                <td className={`rw-rankno${row.rank <= 3 ? ' is-top' : ''}`}>
                  {row.rank}
                </td>
                <td>{row.name}</td>
                <td className="num rw-value">{boardValue(boardDef, row.value)}</td>
                <td className="num">
                  {row.prize > 0 ? (
                    <span className="rw-coins">{fmt(row.prize)}</span>
                  ) : (
                    <span className="rw-sub" style={{ margin: 0 }} aria-label="No prize">
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
