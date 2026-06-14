/**
 * Challenges sub-view — missions that grant coins. Completed challenges (progress ≥
 * goal) surface a Claim action that credits coins; in-progress ones show their bar.
 * Coins / status only — never cash, never a "$" amount.
 */
import type { CSSProperties } from 'react'
import { SEED_CHALLENGES, coins, coinsShort, type Challenge, type RewardsApi } from './data.js'

function ChallengeRow({ c, api }: { c: Challenge; api: RewardsApi }) {
  const pct = Math.min(100, (c.progress / c.goal) * 100)
  const complete = c.progress >= c.goal
  const claimed = api.isClaimed(c.id)
  return (
    <div className="rw-card rw-row" key={c.id}>
      <span className="rw-icon is-sm">
        <c.icon aria-hidden="true" />
      </span>
      <div className="rw-row-body">
        <span className="rw-row-name">{c.name}</span>
        <span className="rw-row-desc">{c.desc}</span>
        <div
          className="rw-progress"
          style={{ marginTop: 6 } as CSSProperties}
          role="progressbar"
          aria-valuenow={Math.min(c.progress, c.goal)}
          aria-valuemin={0}
          aria-valuemax={c.goal}
          aria-label={`${c.name} progress`}
        >
          <div className="rw-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="rw-progress-meta">
          <span>
            {coinsShort(c.progress)}/{coinsShort(c.goal)}
          </span>
          <span>
            <span className="rw-coins">+{coinsShort(c.reward)}</span>
            {c.rewardExtra ? <span className="rw-pill is-gold">{c.rewardExtra}</span> : null}
          </span>
        </div>
      </div>
      {complete ? (
        <button
          type="button"
          className="rw-btn rw-btn-primary"
          disabled={claimed}
          onClick={() => api.claim(c.id, c.reward, `${c.name} claimed — +${coins(c.reward)}`)}
        >
          {claimed ? 'Claimed' : `Claim ${coins(c.reward)}`}
        </button>
      ) : null}
    </div>
  )
}

export function ChallengesView({ api }: { api: RewardsApi }) {
  const completed = SEED_CHALLENGES.filter((c) => c.progress >= c.goal)
  const inProgress = SEED_CHALLENGES.filter((c) => c.progress < c.goal)

  return (
    <>
      <div className="rw-head">
        <h2 className="rw-h2" style={{ margin: 0 } as CSSProperties}>
          Challenges
        </h2>
        <span className="rw-sub" style={{ margin: 0 } as CSSProperties}>
          Complete missions to bank bonus coins
        </span>
      </div>

      <section aria-label="Ready to claim">
        <h2 className="rw-h2">Ready to claim</h2>
        {completed.length ? (
          <div className="rw-list">
            {completed.map((c) => (
              <ChallengeRow key={c.id} c={c} api={api} />
            ))}
          </div>
        ) : (
          <div className="rw-empty">No challenges ready to claim yet — keep playing.</div>
        )}
      </section>

      <section aria-label="In progress">
        <h2 className="rw-h2">In progress</h2>
        {inProgress.length ? (
          <div className="rw-list">
            {inProgress.map((c) => (
              <ChallengeRow key={c.id} c={c} api={api} />
            ))}
          </div>
        ) : (
          <div className="rw-empty">Every challenge is complete — nice work.</div>
        )}
      </section>
    </>
  )
}
