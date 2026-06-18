/**
 * Competitions — the player's view of live/upcoming/finished contests and their leaderboards.
 * Tapping Join opts in: a paid event HOLDS the entry fee through `core` (free events just
 * record the entry). Standings are read-only projections off settled activity (or a seeded
 * demo board). Credits/balance only — no cash, no withdrawal.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Account } from '../../core/index.js'
import { formatMoney } from '../../games/shared/money.js'
import {
  getCompetitions,
  subscribeCompetitions,
  getCompetitionsVersion,
  statusOf,
  leaderboard,
  projectedPool,
  entriesFor,
  isEntered,
  joinCompetition,
} from '../store.js'
import { seedDemoCompetitions } from '../seed.js'
import { formatMetricValue, METRIC_META } from '../metrics.js'
import type { Competition, CompetitionStatus } from '../types.js'
import './competitions.css'

export interface CompetitionsSectionProps {
  account: Account
  playerName: string
  /** Demo sign-in → seed sample competitions so the surface renders populated. */
  isDemo?: boolean
  /** Nudge the app header to re-read the figure after an entry fee moves it. */
  onBalanceChange?: () => void
}

const STATUS_LABEL: Record<CompetitionStatus, string> = {
  upcoming: 'Upcoming',
  live: 'Live',
  ended: 'Awaiting results',
  closed: 'Closed',
  paid: 'Finished',
}

const THEME_LABEL: Record<Competition['theme'], string> = {
  weekly_race: 'Weekly race',
  monthly_tournament: 'Monthly tournament',
  seasonal: 'Seasonal',
  holiday: 'Holiday',
  custom: 'Contest',
}

const ORDER: Record<CompetitionStatus, number> = {
  live: 0,
  upcoming: 1,
  ended: 2,
  closed: 3,
  paid: 4,
}

export function CompetitionsSection({
  account,
  playerName,
  isDemo = false,
  onBalanceChange,
}: CompetitionsSectionProps) {
  useSyncExternalStore(subscribeCompetitions, getCompetitionsVersion)
  const [error, setError] = useState<string | null>(null)
  const now = Date.now()

  useEffect(() => {
    if (isDemo) seedDemoCompetitions(Date.now())
  }, [isDemo])

  const comps = [...getCompetitions()].sort(
    (a, b) => ORDER[statusOf(a, now)] - ORDER[statusOf(b, now)] || a.startsAt - b.startsAt,
  )

  const join = (comp: Competition) => {
    setError(null)
    try {
      joinCompetition({ competitionId: comp.id, account, playerName, now: Date.now() })
      onBalanceChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="comp">
      <header className="comp-intro">
        <h2 className="comp-title">Competitions</h2>
        <p className="comp-sub">
          Time-boxed contests ranked off real settled play. Climb the board, win from the pool —
          credits only.
        </p>
      </header>

      {error && (
        <p className="comp-error" role="alert">
          {error}
        </p>
      )}

      {comps.length === 0 ? (
        <p className="comp-empty">No competitions running yet — check back soon.</p>
      ) : (
        <div className="comp-list">
          {comps.map((comp) => (
            <CompetitionCard
              key={comp.id}
              comp={comp}
              now={now}
              accountId={account.id}
              onJoin={() => join(comp)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CompetitionCard({
  comp,
  now,
  accountId,
  onJoin,
}: {
  comp: Competition
  now: number
  accountId: string
  onJoin: () => void
}) {
  const status = statusOf(comp, now)
  const board = leaderboard(comp, now).slice(0, 6)
  const pool = projectedPool(comp)
  const entered = isEntered(comp.id, accountId)
  const entrants = comp.demo ? (comp.seededStandings?.length ?? 0) : entriesFor(comp.id).length
  // Demo events are display-only samples — not joinable (the store refuses too).
  const joinable = !comp.demo && (status === 'upcoming' || status === 'live') && !entered
  const meta = METRIC_META[comp.metric]
  const mine = board.find((s) => s.accountId === accountId)

  return (
    <section className={`comp-card is-${status}`} aria-label={comp.name}>
      <div className="comp-card-head">
        <div>
          <div className="comp-badges">
            <span className={`comp-status is-${status}`}>{STATUS_LABEL[status]}</span>
            <span className="comp-theme">{THEME_LABEL[comp.theme]}</span>
          </div>
          <h3 className="comp-name">{comp.name}</h3>
          {comp.blurb && <p className="comp-blurb">{comp.blurb}</p>}
        </div>
        <div className="comp-pool">
          <span className="comp-pool-label">Prize pool</span>
          <strong className="comp-pool-amount">{formatMoney(pool)}</strong>
        </div>
      </div>

      <div className="comp-meta">
        <span>
          Ranked by <strong>{meta.label}</strong>
        </span>
        <span>{entrants} entered</span>
        <span>
          {comp.entryFeeCents > 0 ? `${formatMoney(comp.entryFeeCents)} entry` : 'Free entry'}
        </span>
      </div>

      {board.length > 0 ? (
        <ol className="comp-board">
          {board.map((s) => (
            <li
              key={s.accountId}
              className={`comp-row${s.accountId === accountId ? ' is-me' : ''}${s.prizeCents > 0 ? ' is-money' : ''}`}
            >
              <span className="comp-rank">{s.rank}</span>
              <span className="comp-pname">{s.name}</span>
              <span className="comp-val">{formatMetricValue(comp.metric, s.value)}</span>
              <span className="comp-win">{s.prizeCents > 0 ? formatMoney(s.prizeCents) : ''}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="comp-board-empty">Leaderboard opens when the event goes live.</p>
      )}

      <div className="comp-foot">
        {comp.demo ? (
          <span className="comp-closed-note">Sample event</span>
        ) : entered ? (
          <span className="comp-entered">
            {mine ? `You're #${mine.rank}` : "You're in — play to climb"}
          </span>
        ) : joinable ? (
          <button type="button" className="comp-join" onClick={onJoin}>
            {comp.entryFeeCents > 0 ? `Join — ${formatMoney(comp.entryFeeCents)}` : 'Join — free'}
          </button>
        ) : (
          <span className="comp-closed-note">
            {status === 'paid' ? 'Prizes paid' : 'Entries closed'}
          </span>
        )}
      </div>
    </section>
  )
}
