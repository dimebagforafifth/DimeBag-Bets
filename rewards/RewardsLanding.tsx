/**
 * Rewards landing — the lobby. Surfaces the player's rank + progress, what's claimable
 * right now, active challenges, and quick links into every sub-view. Coins/status only.
 */
import type { CSSProperties } from 'react'
import {
  VIEWS,
  DAILY_CYCLE,
  SEED_CHALLENGES,
  tierProgress,
  coins,
  coinsShort,
  type RewardsApi,
} from './data.js'
import { Gift } from 'lucide-react'

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
                {coins(prog.toNext)} wagered to <strong style={{ color: 'var(--text)' }}>{prog.next.name}</strong>
              </span>
            ) : (
              <span className="rw-pill is-gold">Top tier reached</span>
            )}
          </div>
          <div className="rw-progress" role="progressbar" aria-valuenow={Math.round(prog.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next tier">
            <div className="rw-progress-fill" style={{ width: `${prog.pct * 100}%` }} />
          </div>
          <div className="rw-progress-meta">
            <span>{coinsShort(player.wagered)} coins wagered</span>
            {prog.next && <span>{coinsShort(prog.next.minWagered)}</span>}
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
          <strong className="rw-coins">{coinsShort(api.balanceCoins)}</strong>
        </div>
        <div className="rw-kpi">
          <span className="rw-label">Wagered</span>
          <strong>{coinsShort(player.wagered)}</strong>
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
                {coins(today.reward)}
                {today.bonus ? ` + ${today.bonus}` : ''}
              </span>
            </div>
            <button
              type="button"
              className="rw-btn rw-btn-primary"
              disabled={player.dailyClaimedToday || api.isClaimed('daily-today')}
              onClick={() => api.claim('daily-today', today.reward, `Daily bonus claimed — +${coins(today.reward)}`)}
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
                  {coins(c.reward)}
                  {c.rewardExtra ? ` + ${c.rewardExtra}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="rw-btn rw-btn-primary"
                onClick={() => api.claim(c.id, c.reward, `${c.name} claimed — +${coins(c.reward)}`)}
              >
                Claim
              </button>
            </div>
          ))}
        </div>
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
              <span className="rw-coins">+{coinsShort(c.reward)}</span>
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
