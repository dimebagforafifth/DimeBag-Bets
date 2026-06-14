/**
 * Badges — the player's achievement collection. Grouped by category (wins /
 * streaks / tiers / milestones); each badge is an earned or locked status
 * milestone. These are purely status/cosmetic — no coins move here. Coins/status only.
 */
import type { CSSProperties } from 'react'
import { SEED_ACHIEVEMENTS, type BadgeCategory, type RewardsApi } from './data.js'

const CATEGORY_ORDER: BadgeCategory[] = ['wins', 'streaks', 'tiers', 'milestones']
const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  wins: 'Wins',
  streaks: 'Streaks',
  tiers: 'Tiers',
  milestones: 'Milestones',
}

export function BadgesView({ api: _api }: { api: RewardsApi }) {
  const total = SEED_ACHIEVEMENTS.length
  const earned = SEED_ACHIEVEMENTS.filter((a) => a.earned).length

  return (
    <>
      <div className="rw-head">
        <h2 className="rw-h2" style={{ margin: 0 }}>
          Badges
        </h2>
        <span className="rw-sub" style={{ margin: 0 }}>
          {earned}/{total} unlocked
        </span>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const badges = SEED_ACHIEVEMENTS.filter((a) => a.category === category)
        if (badges.length === 0) return null
        return (
          <section key={category} aria-label={CATEGORY_LABEL[category]}>
            <h2 className="rw-h2">{CATEGORY_LABEL[category]}</h2>
            <div className="rw-badges">
              {badges.map((a) => (
                <div
                  key={a.id}
                  className={`rw-badge${a.earned ? '' : ' is-locked'}`}
                >
                  <span
                    className="rw-icon"
                    style={{ ['--accent' as string]: 'var(--gold)' } as CSSProperties}
                  >
                    <a.icon aria-hidden="true" />
                  </span>
                  <span className="rw-badge-name">{a.name}</span>
                  <span className="rw-badge-desc">{a.desc}</span>
                  {a.earned ? (
                    <span className="rw-pill is-gold">
                      {a.earnedOn ? `Earned ${a.earnedOn}` : 'Earned'}
                    </span>
                  ) : (
                    <span className="rw-pill">Locked</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}
