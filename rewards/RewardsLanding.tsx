/**
 * Rewards landing — the lobby. Surfaces the player's rank + progress, what's claimable
 * right now, active challenges, and quick links into every sub-view. Balance & status only.
 */
import type { CSSProperties } from 'react'
import {
  VIEWS,
  DAILY_CYCLE,
  SEED_CHALLENGES,
  tierProgress,
  fmt,
  fmtCents,
  num,
  type RewardsApi,
} from './data.js'
import { Gift, Wallet, Lock } from 'lucide-react'

export function RewardsLanding({ api }: { api: RewardsApi }) {
  const { player } = api
  const prog = tierProgress(player.wagered)
  const Tier = prog.tier.icon
  const today = DAILY_CYCLE[Math.min(player.loginStreak, DAILY_CYCLE.length - 1)]

  const claimableChallenges = SEED_CHALLENGES.filter(
    (c) => c.progress >= c.goal && !api.isClaimed(c.id),
  )
  const activeChallenges = SEED_CHALLENGES.filter((c) => c.progress < c.goal).slice(0, 3)

  return (
    <>
      {/* Hero rank card */}
      <section
        className="rw-hero"
        style={{ ['--accent' as string]: prog.tier.color } as CSSProperties}
        aria-label="Your rank"
      >
        <div className="rw-hero-emblem">
          <Tier aria-hidden="true" />
        </div>
        <div className="rw-hero-body">
          <div className="rw-head">
            <span className="rw-h2" style={{ margin: 0 }}>
              {prog.tier.name} tier
            </span>
            {prog.next ? (
              <span className="rw-sub" style={{ margin: 0 }}>
                {num(prog.toNext)} status to <strong style={{ color: 'var(--text)' }}>{prog.next.name}</strong>
              </span>
            ) : (
              <span className="rw-pill is-gold">Top tier reached</span>
            )}
          </div>
          <div className="rw-progress" role="progressbar" aria-valuenow={Math.round(prog.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next tier">
            <div className="rw-progress-fill" style={{ width: `${prog.pct * 100}%` }} />
          </div>
          <div className="rw-progress-meta">
            <span>{num(player.wagered)} status</span>
            {prog.next && <span>{num(prog.next.minWagered)}</span>}
          </div>
        </div>
        <button type="button" className="rw-btn" onClick={() => api.go('ranks')}>
          View ladder
        </button>
      </section>

      {/* Quick stats */}
      <section className="rw-kpis" aria-label="Your activity">
        <div className="rw-kpi">
          <span className="rw-label">Balance</span>
          <strong className="rw-coins">{fmtCents(api.balanceCents)}</strong>
        </div>
        <div className="rw-kpi">
          <span className="rw-label">Status</span>
          <strong>{num(player.wagered)}</strong>
        </div>
        <div className="rw-kpi">
          <span className="rw-label">Bets placed</span>
          <strong>{player.betsPlaced}</strong>
        </div>
        <div className="rw-kpi">
          <span className="rw-label">Days active</span>
          <strong>{player.daysActive}</strong>
        </div>
        <div className="rw-kpi">
          <span className="rw-label">Login streak</span>
          <strong>{player.loginStreak} 🔥</strong>
        </div>
      </section>

      {/* Claim now */}
      <section className="rw-card" aria-label="Claim now">
        <h2 className="rw-h2">Claim now</h2>
        <div className="rw-list">
          <div className="rw-row">
            <span className="rw-icon is-sm">
              <Gift aria-hidden="true" />
            </span>
            <div className="rw-row-body">
              <span className="rw-row-name">Daily login bonus · day {today.day}</span>
              <span className="rw-row-desc">
                {fmt(today.reward)}
                {today.bonus ? ` + ${today.bonus}` : ''}
              </span>
            </div>
            <button
              type="button"
              className="rw-btn rw-btn-primary"
              disabled={player.dailyClaimedToday || api.isClaimed('daily-today')}
              onClick={() => api.claim('daily-today', today.reward, `Daily bonus claimed — +${fmt(today.reward)}`)}
            >
              {api.isClaimed('daily-today') ? 'Claimed' : 'Claim'}
            </button>
          </div>

          {claimableChallenges.map((c) => (
            <div className="rw-row" key={c.id}>
              <span className="rw-icon is-sm">
                <c.icon aria-hidden="true" />
              </span>
              <div className="rw-row-body">
                <span className="rw-row-name">{c.name} · complete</span>
                <span className="rw-row-desc">
                  {fmt(c.reward)}
                  {c.rewardExtra ? ` + ${c.rewardExtra}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="rw-btn rw-btn-primary"
                onClick={() => api.claim(c.id, c.reward, `${c.name} claimed — +${fmt(c.reward)}`)}
              >
                Claim
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Cashback & locked bonuses (the play-through mechanics) */}
      <section className="rw-card" aria-label="Cashback and bonuses">
        <div className="rw-head">
          <h2 className="rw-h2" style={{ margin: 0 }}>
            Cashback &amp; bonuses
          </h2>
          {api.cashbackPending > 0 && (
            <button type="button" className="rw-btn rw-btn-primary" onClick={api.claimCashback}>
              Claim {fmt(api.cashbackPending)} cashback
            </button>
          )}
        </div>
        <p className="rw-sub" style={{ margin: '0 0 8px' }}>
          Cashback returns a slice of everything you wager. Bonus balance unlocks to your figure as
          you play — never convertible to money.
        </p>
        {api.cashbackPending === 0 && api.locked.length === 0 ? (
          <p className="rw-row-desc">Keep playing to earn cashback and unlock bonuses.</p>
        ) : (
          <div className="rw-list">
            {api.cashbackPending > 0 && (
              <div className="rw-row">
                <span className="rw-icon is-sm">
                  <Wallet aria-hidden="true" />
                </span>
                <div className="rw-row-body">
                  <span className="rw-row-name">Cashback pending</span>
                  <span className="rw-row-desc">
                    {fmt(api.cashbackPending)} ready to claim into your balance
                  </span>
                </div>
              </div>
            )}
            {api.locked.map((b) => {
              const pct = Math.min(100, (b.wagered / b.wagerRequired) * 100)
              return (
                <div className="rw-row" key={b.id}>
                  <span className="rw-icon is-sm">
                    <Lock aria-hidden="true" />
                  </span>
                  <div className="rw-row-body">
                    <span className="rw-row-name">
                      {fmt(b.amount)} locked · {b.source}
                    </span>
                    <span className="rw-row-desc">
                      {num(b.wagered)} / {num(b.wagerRequired)} wagered to unlock
                    </span>
                    <div className="rw-progress" style={{ marginTop: 6 }}>
                      <div className="rw-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="rw-coins">{Math.round(pct)}%</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Active challenges */}
      <section className="rw-card" aria-label="Active challenges">
        <div className="rw-head">
          <h2 className="rw-h2" style={{ margin: 0 }}>
            Active challenges
          </h2>
          <button type="button" className="rw-btn" onClick={() => api.go('challenges')}>
            All challenges
          </button>
        </div>
        <div className="rw-list">
          {activeChallenges.map((c) => (
            <div className="rw-row" key={c.id}>
              <span className="rw-icon is-sm">
                <c.icon aria-hidden="true" />
              </span>
              <div className="rw-row-body">
                <span className="rw-row-name">{c.name}</span>
                <span className="rw-row-desc">{c.desc}</span>
                <div className="rw-progress" style={{ marginTop: 6 }}>
                  <div
                    className="rw-progress-fill"
                    style={{ width: `${Math.min(100, (c.progress / c.goal) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="rw-coins">+{fmt(c.reward)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Quick links into the sub-views */}
      <section aria-label="Explore rewards">
        <h2 className="rw-h2">Explore</h2>
        <div className="rw-grid">
          {VIEWS.filter((v) => v.id !== 'overview').map((v) => (
            <button key={v.id} type="button" className="rw-tile" onClick={() => api.go(v.id)}>
              <span className="rw-icon">
                <v.icon aria-hidden="true" />
              </span>
              <span className="rw-tile-name">{v.name}</span>
              <span className="rw-tile-hint">{v.hint}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
