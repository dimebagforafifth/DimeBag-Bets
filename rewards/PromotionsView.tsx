/**
 * Promotions sub-view — the operator's active offers the player can claim / opt into.
 * COINS & PERKS ONLY: coin-bonus campaigns, free plays on casino originals, odds boosts
 * (coin winnings only), top-up matches. No cash, no cash value. Top-up/bonus promos add
 * LOCKED bonus coins that unlock to regular coins by playing (a coins-only playthrough,
 * never a cash-out).
 */
import type { CSSProperties } from 'react'
import { Gift, Rocket, TrendingUp, Coins } from 'lucide-react'
import { coins, type RewardsApi } from './data.js'
import type { Promo, PromoKind } from './economy.js'

const KIND: Record<PromoKind, { label: string; color: string; icon: typeof Gift }> = {
  topup: { label: 'Top-up match', color: '#d6b14a', icon: Coins },
  bonus: { label: 'Bonus coins', color: '#d6b14a', icon: Gift },
  freeplay: { label: 'Free play', color: '#7fc7d9', icon: Rocket },
  oddsboost: { label: 'Odds boost', color: '#7fd99a', icon: TrendingUp },
}

const amountLabel = (p: Promo): string =>
  p.kind === 'oddsboost'
    ? `+${p.amount}% boost`
    : p.kind === 'freeplay'
      ? `${p.amount} free play${p.amount === 1 ? '' : 's'}`
      : `up to ${coins(p.amount)}`

export function PromotionsView({ api, now }: { api: RewardsApi; now: number }) {
  const endsInDays = (p: Promo) => Math.max(0, Math.ceil((p.endsAt - now) / 86_400_000))
  return (
    <>
      <h2 className="rw-h2" style={{ margin: 0 }}>
        Promotions
      </h2>
      <p className="rw-sub">
        Live offers from the book — claim coin bonuses, grab free plays, opt into odds boosts. Coins
        and perks only.
      </p>

      {api.promos.length === 0 ? (
        <p className="rw-empty">No promotions running right now — check back soon.</p>
      ) : (
        <div className="rw-grid" role="list" aria-label="Active promotions">
          {api.promos.map((p) => {
            const k = KIND[p.kind]
            const claimed = api.isClaimed(p.id)
            return (
              <article className="rw-card" role="listitem" key={p.id}>
                <div className="rw-head">
                  <span className="rw-icon" style={{ ['--accent' as string]: k.color } as CSSProperties}>
                    <k.icon aria-hidden="true" />
                  </span>
                  <span className="rw-pill">{k.label}</span>
                </div>
                <span className="rw-tile-name">{p.name}</span>
                <span className="rw-row-desc">{p.desc}</span>
                <div className="rw-promo-meta">
                  <strong className="rw-coins">{amountLabel(p)}</strong>
                  <span className="rw-label">ends in {endsInDays(p)}d</span>
                </div>
                {p.playthrough > 0 && (
                  <span className="rw-lock-note">Unlocks to coins after {p.playthrough}× wagering</span>
                )}
                <div className="rw-head" style={{ marginTop: 'auto' }}>
                  <button
                    type="button"
                    className="rw-btn rw-btn-primary"
                    disabled={claimed}
                    onClick={() => api.claimPromo(p)}
                  >
                    {claimed ? 'Claimed' : p.kind === 'oddsboost' ? 'Opt in' : 'Claim'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
