/**
 * Daily — the login-bonus + streak sub-view. Shows the current login streak
 * prominently, the 7-day reward cycle as a strip (completed / claimable today /
 * upcoming), and a single primary claim for today's bonus. Balance & status only.
 */
import type { CSSProperties } from 'react'
import { Flame } from 'lucide-react'
import { DAILY_CYCLE, fmt, type RewardsApi } from './data.js'

export function DailyView({ api }: { api: RewardsApi }) {
  const { player } = api
  const streak = player.loginStreak
  const cycleLen = DAILY_CYCLE.length

  // Today's claimable day = day (streak + 1) → DAILY_CYCLE[streak]. Null once the
  // 7-day cycle is exhausted (streak >= cycleLen).
  const today = streak < cycleLen ? DAILY_CYCLE[streak] : null
  const alreadyClaimed = api.isClaimed('daily-today') || player.dailyClaimedToday
  const claimablePct = Math.round((Math.min(streak, cycleLen) / cycleLen) * 100)

  return (
    <>
      <header className="rw-section-head">
        <h2 className="rw-h2" style={{ margin: 0 }}>
          Daily login bonus
        </h2>
        <p className="rw-sub" style={{ margin: 0 }}>
          Show up every day to climb the reward cycle. Rewards grow through day 7, then the
          cycle restarts at day 1. Miss a day and your streak resets to zero.
        </p>
      </header>

      {/* Streak hero */}
      <section
        className="rw-hero"
        style={{ ['--accent' as string]: '#d27068' } as CSSProperties}
        aria-label="Your login streak"
      >
        <div className="rw-hero-emblem" aria-hidden="true">
          <Flame />
        </div>
        <div className="rw-hero-body">
          <div className="rw-head">
            <span className="rw-h2" style={{ margin: 0 }}>
              {streak}-day streak 🔥
            </span>
            {today ? (
              <span className="rw-sub" style={{ margin: 0 }}>
                Day {today.day} is ready — claim{' '}
                <strong style={{ color: 'var(--gold)' }}>{fmt(today.reward)}</strong>
              </span>
            ) : (
              <span className="rw-pill is-gold">Cycle complete</span>
            )}
          </div>
          <div
            className="rw-progress"
            role="progressbar"
            aria-valuenow={claimablePct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progress through the 7-day cycle"
          >
            <div className="rw-progress-fill" style={{ width: `${claimablePct}%` }} />
          </div>
          <div className="rw-progress-meta">
            <span>
              {Math.min(streak, cycleLen)} of {cycleLen} days
            </span>
            <span>Resets after day {cycleLen}</span>
          </div>
        </div>
        {today && (
          <button
            type="button"
            className="rw-btn rw-btn-primary"
            disabled={alreadyClaimed}
            onClick={() =>
              api.claim('daily-today', today.reward, `Daily bonus claimed — +${fmt(today.reward)}`)
            }
            aria-label={alreadyClaimed ? 'Daily bonus already claimed' : `Claim ${fmt(today.reward)}`}
          >
            {alreadyClaimed ? 'Claimed' : `Claim ${fmt(today.reward)}`}
          </button>
        )}
      </section>

      {/* 7-day reward strip */}
      <section aria-label="7-day reward cycle">
        <h2 className="rw-h2">Reward cycle</h2>
        <div className="rw-grid">
          {DAILY_CYCLE.map((d) => {
            const done = d.day <= streak
            const isToday = today != null && d.day === today.day
            const locked = !done && !isToday

            const status = done ? 'Collected' : isToday ? 'Today' : 'Upcoming'
            const pillClass = done ? 'rw-pill is-up' : isToday ? 'rw-pill is-gold' : 'rw-pill'

            return (
              <div
                className="rw-card"
                key={d.day}
                style={locked ? { opacity: 0.55 } : undefined}
                aria-label={`Day ${d.day} — ${fmt(d.reward)} — ${status}`}
              >
                <div className="rw-head" style={{ alignItems: 'center' }}>
                  <span className="rw-label">Day {d.day}</span>
                  <span className={pillClass}>{status}</span>
                </div>
                <div className="rw-coins" style={{ fontSize: 21, marginTop: 8 }}>
                  +{fmt(d.reward)}
                </div>
                {d.bonus && (
                  <div className="rw-row-desc" style={{ marginTop: 4 }}>
                    + {d.bonus}
                  </div>
                )}

                {isToday && (
                  <button
                    type="button"
                    className="rw-btn rw-btn-primary"
                    style={{ marginTop: 12, alignSelf: 'flex-start' }}
                    disabled={alreadyClaimed}
                    onClick={() =>
                      api.claim(
                        'daily-today',
                        d.reward,
                        `Daily bonus claimed — +${fmt(d.reward)}`,
                      )
                    }
                    aria-label={
                      alreadyClaimed ? 'Daily bonus already claimed' : `Claim ${fmt(d.reward)}`
                    }
                  >
                    {alreadyClaimed ? 'Claimed' : `Claim ${fmt(d.reward)}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <p className="rw-sub">
          Your streak resets to zero if you miss a day, and the cycle loops back to day 1 after
          you collect day {cycleLen}.
        </p>
      </section>
    </>
  )
}
