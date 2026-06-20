/**
 * Boosts (player) — the offers available to this player, plus the boost credits they've earned.
 * Read-only: it shows what's on offer and what was granted; the grant itself happens at
 * settlement through the bonus engine. No control here moves money.
 */

import { useSyncExternalStore, type ReactNode } from 'react'
import { formatMoney } from '../../games/shared/money.js'
import { getBonusGrantsVersion, grantsForPlayer, subscribeBonusGrants } from '../../bonus/index.js'
import { getBoosts, getBoostsVersion, subscribeBoosts } from '../store.js'
import { availableBoostsFor } from '../engine.js'
import type { BoostDef } from '../types.js'
import './boosts.css'

function describe(b: BoostDef): string {
  const q = b.qualifier
  const who = [
    q.sgpOnly ? 'same-game parlays' : null,
    q.minLegs && q.minLegs > 1 ? `${q.minLegs}+ legs` : null,
    q.sports?.length ? q.sports.map((s) => s[0] + s.slice(1).toLowerCase()).join(', ') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const base = b.boostType === 'odds' ? 'better odds' : 'extra winnings'
  return `+${b.pct}% ${base}${who ? ` on ${who}` : ''}`
}

export function BoostsSection({ viewerId }: { viewerId: string }): ReactNode {
  useSyncExternalStore(subscribeBoosts, getBoostsVersion, getBoostsVersion)
  useSyncExternalStore(subscribeBonusGrants, getBonusGrantsVersion, getBonusGrantsVersion)

  const offers = availableBoostsFor(viewerId)
  const boostIds = new Set(getBoosts().map((b) => b.id))
  const earned = grantsForPlayer(viewerId).filter((g) => boostIds.has(g.ruleId))

  return (
    <section className="boosts-player">
      <header className="boosts-player-head">
        <h1 className="boosts-h1">Boosts</h1>
        <p className="boosts-sub">
          Qualify a bet and we top up your winnings — paid as bonus credits when the bet settles.
        </p>
      </header>

      <div className="boosts-section">
        <h2 className="boosts-h2">Available to you</h2>
        {offers.length === 0 ? (
          <p className="boosts-empty">No boosts available right now — check back soon.</p>
        ) : (
          <div className="boosts-offers">
            {offers.map((b) => (
              <div className="boosts-offer" key={b.id}>
                <span className={`boosts-offer-tag is-${b.boostType}`}>
                  {b.boostType === 'odds' ? 'Odds' : 'Profit'}
                </span>
                <span className="boosts-offer-name">{b.name}</span>
                <span className="boosts-offer-desc">{describe(b)}</span>
                {b.maxWinCents != null && (
                  <span className="boosts-offer-cap">up to {formatMoney(b.maxWinCents)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {earned.length > 0 && (
        <div className="boosts-section">
          <h2 className="boosts-h2">Your boost credits</h2>
          <div className="boosts-grants">
            {earned.slice(0, 10).map((g) => (
              <div className="boosts-grant" key={g.id}>
                <span className="boosts-grant-rule">{g.ruleName}</span>
                <span className="boosts-grant-amt">{formatMoney(g.grantedCents)}</span>
                <span className={`boosts-grant-status is-${g.status}`}>
                  {g.status === 'active' ? 'playing through' : g.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
