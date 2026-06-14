/**
 * Ranks — the VIP-style tier ladder. A summary of the player's current tier and
 * progress to the next, then the full ladder from Rookie → Diamond with each
 * tier's coins-wagered threshold and what it unlocks. The player's current tier is
 * marked; passed tiers read as earned, upcoming tiers as locked. Coins/status only.
 */
import type { CSSProperties } from 'react'
import { TIERS, tierProgress, coins, coinsShort, type RewardsApi } from './data.js'

export function RanksView({ api }: { api: RewardsApi }) {
  const { player } = api
  const prog = tierProgress(player.wagered)
  const Emblem = prog.tier.icon

  return (
    <>
      {/* ── intro ── */}
      <header className="rw-section-head">
        <h2 className="rw-h2" style={{ margin: 0 }}>
          Tier ladder
        </h2>
        <p className="rw-sub">
          Rank up through activity — coins wagered, days active and bets placed. Every tier you
          reach unlocks bonus coins, perks and status that stick.
        </p>
      </header>

      {/* ── current-tier summary ── */}
      <section
        className="rw-hero"
        style={{ ['--accent' as string]: prog.tier.color } as CSSProperties}
        aria-label="Your current tier"
      >
        <div className="rw-hero-emblem">
          <Emblem aria-hidden="true" />
        </div>
        <div className="rw-hero-body">
          <div className="rw-head">
            <span className="rw-h2" style={{ margin: 0 }}>
              {prog.tier.name} tier
            </span>
            {prog.next ? (
              <span className="rw-sub" style={{ margin: 0 }}>
                {coins(prog.toNext)} wagered to{' '}
                <strong style={{ color: 'var(--text)' }}>{prog.next.name}</strong>
              </span>
            ) : (
              <span className="rw-pill is-gold">Top tier reached</span>
            )}
          </div>
          <div
            className="rw-progress"
            role="progressbar"
            aria-valuenow={Math.round(prog.pct * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={
              prog.next ? `Progress to ${prog.next.name} tier` : 'Top tier reached'
            }
          >
            <div className="rw-progress-fill" style={{ width: `${prog.pct * 100}%` }} />
          </div>
          <div className="rw-progress-meta">
            <span>{coinsShort(player.wagered)} coins wagered</span>
            {prog.next && <span>{coinsShort(prog.next.minWagered)}</span>}
          </div>
        </div>
      </section>

      {/* ── full ladder ── */}
      <section aria-label="All tiers">
        <h2 className="rw-h2">All tiers</h2>
        <div className="rw-list">
          {TIERS.map((tier) => {
            const Icon = tier.icon
            const isCurrent = tier.id === prog.tier.id
            const isPassed = !isCurrent && player.wagered >= tier.minWagered

            return (
              <article
                key={tier.id}
                className="rw-card"
                style={
                  {
                    ['--accent' as string]: tier.color,
                    ...(isCurrent
                      ? { borderColor: 'var(--gold)' }
                      : isPassed
                        ? null
                        : { opacity: 0.62 }),
                  } as CSSProperties
                }
                aria-current={isCurrent ? 'true' : undefined}
              >
                <div className="rw-head" style={{ alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
                    <span
                      className="rw-icon"
                      style={{ ['--accent' as string]: tier.color } as CSSProperties}
                    >
                      <Icon aria-hidden="true" />
                    </span>
                    <div
                      style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}
                    >
                      <span className="rw-tile-name">{tier.name}</span>
                      <span className="rw-tile-hint">
                        {coinsShort(tier.minWagered)} coins wagered
                      </span>
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="rw-pill is-gold">Current</span>
                  ) : isPassed ? (
                    <span className="rw-pill is-up">Unlocked</span>
                  ) : (
                    <span className="rw-pill">Locked</span>
                  )}
                </div>

                <div className="rw-list" style={{ marginTop: 14, gap: 8 }}>
                  {tier.unlocks.map((unlock, i) => {
                    const UIcon = unlock.icon
                    return (
                      <div className="rw-row" key={i} style={{ padding: '10px 12px' }}>
                        <span
                          className="rw-icon is-sm"
                          style={{ ['--accent' as string]: tier.color } as CSSProperties}
                        >
                          <UIcon aria-hidden="true" />
                        </span>
                        <div className="rw-row-body">
                          <span className="rw-row-name" style={{ fontSize: 13.5 }}>
                            {unlock.label}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </>
  )
}
