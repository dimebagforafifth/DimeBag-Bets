/**
 * Limits & Activity — the player's responsible-play surface (Expert addition #1).
 *
 * Two halves, both honest by default (CLAUDE.md §2):
 *   - MY STAT SHEET — a read-only projection of the durable ledger (today / this week / all
 *     time): bets, turnover, net credits, win rate. It moves no money; it reconciles to the
 *     ledger.
 *   - MY LIMITS — the player sets their OWN guardrails: a wager cap, a loss cap (per day or
 *     week), a cool-off (self-exclusion), and a session reminder. Tightening applies at once;
 *     loosening waits out a cool-down (the standard responsible-play pattern), shown plainly.
 *
 * Enforcement is in core (`placeWager` → `assertWithinLimits`); this surface only configures it
 * through the player-owned store. Presentation consumes the global tokens (app/theme.css).
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Role } from '../../org/index.js'
import { formatMoney, toCents } from '../../../games/shared/money.js'
import { getBookLedgerVersion, subscribeBookLedger } from '../../../app/book-ledger.js'
import type { ActiveLimit, LimitPeriod } from '../../../core/index.js'
import {
  activityBreakdown,
  clearLimit,
  getLimitsVersion,
  limitStateOf,
  setLimit,
  subscribeLimits,
} from '../store.js'
import type { ActivitySummary } from '../activity.js'
import './responsible-play.css'

/** The player-section descriptor (the wiring pass registers this — see // SEAM at the foot). */
export const responsiblePlaySection: { id: string; label: string; roles: Role[] } = {
  id: 'limits',
  label: 'Limits & Activity',
  roles: ['player'],
}

const PERIODS: { key: 'day' | 'week' | 'all'; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'all', label: 'All time' },
]

const fmtDate = (ms: number): string => new Date(ms).toLocaleString()
const signed = (cents: number): string =>
  cents > 0 ? `+${formatMoney(cents)}` : formatMoney(cents)
const tone = (cents: number): string => (cents > 0 ? 'rp-up' : cents < 0 ? 'rp-down' : '')

export function LimitsActivitySection({
  playerId,
  playerName,
}: {
  playerId: string
  playerName?: string
}) {
  // Re-render on ledger movements (stat sheet) and on limit changes.
  useSyncExternalStore(subscribeBookLedger, getBookLedgerVersion, getBookLedgerVersion)
  useSyncExternalStore(subscribeLimits, getLimitsVersion, getLimitsVersion)

  const now = Date.now()
  const activity = activityBreakdown(playerId, now)
  const state = limitStateOf(playerId)

  return (
    <section className="rp">
      <header className="rp-head">
        <h1 className="rp-title">Limits &amp; Activity</h1>
        <p className="rp-sub">
          Your play, your guardrails{playerName ? `, ${playerName}` : ''}. Everything here is for
          you — credits only, no cash value. Set a limit anytime; tightening takes effect at once,
          loosening waits a day.
        </p>
      </header>

      <StatSheet activity={activity} />
      <LimitsPanel playerId={playerId} state={state} now={now} />
      <SessionReminder session={state.session?.active ?? null} />
    </section>
  )
}

/* ------------------------------ My Stat Sheet ------------------------------ */

function StatSheet({
  activity,
}: {
  activity: { day: ActivitySummary; week: ActivitySummary; all: ActivitySummary }
}) {
  const [period, setPeriod] = useState<'day' | 'week' | 'all'>('week')
  const s = activity[period]
  const winRate = s.bets > 0 ? Math.round((s.wins / s.bets) * 100) : 0

  return (
    <div className="rp-card">
      <div className="rp-card-head">
        <h2 className="rp-h2">My stat sheet</h2>
        <div className="rp-chips" role="group" aria-label="Stat sheet period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`rp-chip ${period === p.key ? 'is-on' : ''}`}
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rp-stats">
        <Stat label="Net" value={signed(s.netCents)} valueClass={tone(s.netCents)} big />
        <Stat label="Wagered" value={formatMoney(s.wageredCents)} />
        <Stat label="Bets" value={String(s.bets)} />
        <Stat label="Win rate" value={`${winRate}%`} />
        <Stat label="Record" value={`${s.wins}–${s.losses}`} />
        <Stat label="Best win" value={s.biggestWinCents > 0 ? signed(s.biggestWinCents) : '—'} />
      </div>
      {s.bets === 0 && <p className="rp-empty">No graded bets in this window yet.</p>}
    </div>
  )
}

function Stat({
  label,
  value,
  valueClass,
  big,
}: {
  label: string
  value: string
  valueClass?: string
  big?: boolean
}) {
  return (
    <div className={`rp-stat${big ? ' is-big' : ''}`}>
      <span className="rp-stat-label">{label}</span>
      <span className={`rp-stat-value ${valueClass ?? ''}`}>{value}</span>
    </div>
  )
}

/* -------------------------------- My Limits -------------------------------- */

function LimitsPanel({
  playerId,
  state,
  now,
}: {
  playerId: string
  state: Partial<Record<string, { active: ActiveLimit; pending: ActiveLimit | null }>>
  now: number
}) {
  const cooloff = state.cooloff?.active
  const cooloffActive = cooloff?.until != null && now < cooloff.until

  return (
    <div className="rp-card">
      <h2 className="rp-h2">My limits</h2>

      {cooloffActive ? (
        <div className="rp-cooloff-on" role="status">
          <strong>Cool-off active.</strong> No new bets until {fmtDate(cooloff!.until!)}. This can't
          be ended early — that's the point.
        </div>
      ) : (
        <CooloffControl playerId={playerId} />
      )}

      <CapControl
        playerId={playerId}
        kind="wager"
        label="Wager limit"
        hint="The most you can stake in a period."
        slot={state.wager}
        disabled={cooloffActive}
      />
      <CapControl
        playerId={playerId}
        kind="loss"
        label="Loss limit"
        hint="The most you can be net-down in a period before new bets are blocked."
        slot={state.loss}
        disabled={cooloffActive}
      />
      <SessionControl playerId={playerId} slot={state.session} />
    </div>
  )
}

/** A soft session-time reminder (minutes). Not a gate — it only nudges (SessionReminder). */
function SessionControl({
  playerId,
  slot,
}: {
  playerId: string
  slot?: { active: ActiveLimit; pending: ActiveLimit | null }
}) {
  const [mins, setMins] = useState('')
  const current = slot?.active?.amountCents ?? null // session reuses the magnitude as MINUTES

  const apply = () => {
    const v = Number(mins)
    if (!Number.isFinite(v) || v <= 0) return
    setLimit(playerId, { kind: 'session', period: null, amountCents: Math.round(v) })
    setMins('')
  }

  return (
    <div className="rp-limit">
      <div className="rp-limit-top">
        <span className="rp-limit-label">Session reminder</span>
        <span className="rp-limit-now">{current != null ? `every ${current} min` : 'Off'}</span>
      </div>
      <p className="rp-limit-hint">
        A gentle nudge after you&rsquo;ve played a while. Just a reminder.
      </p>
      <div className="rp-limit-row">
        <input
          className="rp-input"
          inputMode="numeric"
          placeholder="Minutes"
          value={mins}
          onChange={(e) => setMins(e.target.value)}
          aria-label="Session reminder minutes"
        />
        <button className="rp-btn rp-btn-primary" onClick={apply}>
          Set
        </button>
        {current != null && (
          <button className="rp-btn" onClick={() => clearLimit(playerId, 'session')}>
            Off
          </button>
        )}
      </div>
    </div>
  )
}

function CapControl({
  playerId,
  kind,
  label,
  hint,
  slot,
  disabled,
}: {
  playerId: string
  kind: 'wager' | 'loss'
  label: string
  hint: string
  slot?: { active: ActiveLimit; pending: ActiveLimit | null }
  disabled?: boolean
}) {
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<LimitPeriod>('day')
  const [msg, setMsg] = useState<string | null>(null)

  const active = slot?.active
  const pending = slot?.pending
  const hasCap = active?.amountCents != null

  const apply = () => {
    const v = Number(amount)
    if (!Number.isFinite(v) || v <= 0) {
      setMsg('Enter an amount.')
      return
    }
    const { deferred } = setLimit(playerId, { kind, period, amountCents: toCents(v) })
    setAmount('')
    // On a loosening the change is queued; read its effective date back for the toast.
    const queuedAt = limitStateOf(playerId)[kind]?.pending?.effectiveAt
    setMsg(
      deferred && queuedAt != null
        ? `Looser limit scheduled — it takes effect ${fmtDate(queuedAt)} once the cool-down passes.`
        : 'Limit applied.',
    )
  }

  const remove = () => {
    const { deferred } = clearLimit(playerId, kind)
    setMsg(deferred ? 'Removal scheduled — your current limit holds for a day.' : 'Limit removed.')
  }

  return (
    <div className="rp-limit">
      <div className="rp-limit-top">
        <span className="rp-limit-label">{label}</span>
        <span className="rp-limit-now">
          {hasCap
            ? `${formatMoney(active!.amountCents!)} / ${active!.period ?? 'day'}`
            : 'No limit'}
        </span>
      </div>
      <p className="rp-limit-hint">{hint}</p>

      {pending?.amountCents != null && (
        <p className="rp-limit-pending">
          Change to {formatMoney(pending.amountCents)} / {pending.period ?? 'day'} takes effect{' '}
          {fmtDate(pending.effectiveAt)}.
        </p>
      )}

      <div className="rp-limit-row">
        <span className="rp-money-in">
          <span className="rp-money-cur">$</span>
          <input
            className="rp-input"
            inputMode="decimal"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label={`${label} amount`}
            disabled={disabled}
          />
        </span>
        <select
          className="rp-input rp-select"
          value={period}
          onChange={(e) => setPeriod(e.target.value as LimitPeriod)}
          aria-label={`${label} period`}
          disabled={disabled}
        >
          <option value="day">per day</option>
          <option value="week">per week</option>
        </select>
        <button className="rp-btn rp-btn-primary" onClick={apply} disabled={disabled}>
          Set
        </button>
        {hasCap && (
          <button className="rp-btn" onClick={remove} disabled={disabled}>
            Remove
          </button>
        )}
      </div>
      {msg && <p className="rp-msg">{msg}</p>}
    </div>
  )
}

const COOLOFF_OPTIONS: { label: string; ms: number }[] = [
  { label: '24 hours', ms: 86_400_000 },
  { label: '7 days', ms: 7 * 86_400_000 },
  { label: '30 days', ms: 30 * 86_400_000 },
]

function CooloffControl({ playerId }: { playerId: string }) {
  const [idx, setIdx] = useState(0)
  const [confirming, setConfirming] = useState(false)

  const start = () => {
    setLimit(playerId, { kind: 'cooloff', until: Date.now() + COOLOFF_OPTIONS[idx].ms })
    setConfirming(false)
  }

  return (
    <div className="rp-limit">
      <div className="rp-limit-top">
        <span className="rp-limit-label">Cool-off</span>
        <span className="rp-limit-now">Self-exclude</span>
      </div>
      <p className="rp-limit-hint">
        Pause all betting for a set window. Once started it can&rsquo;t be cut short.
      </p>
      <div className="rp-limit-row">
        <select
          className="rp-input rp-select"
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          aria-label="Cool-off length"
        >
          {COOLOFF_OPTIONS.map((o, i) => (
            <option key={o.label} value={i}>
              {o.label}
            </option>
          ))}
        </select>
        {!confirming ? (
          <button className="rp-btn" onClick={() => setConfirming(true)}>
            Start cool-off…
          </button>
        ) : (
          <>
            <span className="rp-confirm">Pause betting for {COOLOFF_OPTIONS[idx].label}?</span>
            <button className="rp-btn rp-btn-danger" onClick={start}>
              Confirm
            </button>
            <button className="rp-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ----------------------------- Session reminder ---------------------------- */

function SessionReminder({ session }: { session: ActiveLimit | null }) {
  const intervalMin = session?.amountCents ?? null // session reuses the magnitude as MINUTES
  const [elapsedMin, setElapsedMin] = useState(0)

  useEffect(() => {
    if (intervalMin == null) return
    const startedAt = Date.now()
    const id = setInterval(
      () => setElapsedMin(Math.floor((Date.now() - startedAt) / 60_000)),
      30_000,
    )
    return () => clearInterval(id)
  }, [intervalMin])

  if (intervalMin == null) return null
  const over = elapsedMin >= intervalMin
  return (
    <div className={`rp-session ${over ? 'is-over' : ''}`} role="status">
      Session reminder: {elapsedMin} min played
      {over
        ? ` — you set a ${intervalMin}-minute check-in. Time for a break?`
        : ` of ${intervalMin}.`}
    </div>
  )
}

// SEAM (wiring pass): register the player section via the prop-aware registry in
// app/register-player-sections.tsx —
//   import { LimitsActivitySection, responsiblePlaySection } from '../responsible-play/index.js'
//   registerPlayerSection({
//     key: responsiblePlaySection.id,
//     label: responsiblePlaySection.label,
//     roles: responsiblePlaySection.roles,
//     render: (ctx) => <LimitsActivitySection playerId={ctx.player.id} playerName={ctx.player.name} />,
//   })
// and add 'limits' to the player's allowedSections in auth/roles.ts.
