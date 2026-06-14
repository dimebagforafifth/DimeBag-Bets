/**
 * Store / catalog sub-view — spend coins on perks. Everything here is coins and
 * perks only: bonus coin packs, free plays, limit boosts, profile flair, contest
 * entries. There is NEVER cash, cash value, real-money redemption, or a "$" amount.
 */
import type { CSSProperties } from 'react'
import {
  STORE,
  STORE_KIND_LABEL,
  coins,
  type StoreKind,
  type RewardsApi,
} from './data.js'

/** A sensible accent tint per store-item kind (accents only; labels stay near-white). */
const KIND_COLOR: Record<StoreKind, string> = {
  bonus: '#d6b14a', // gold — coin packs
  freeplay: '#7fc7d9', // teal — free plays
  limit: '#9ad1ff', // blue — limit boosts
  flair: '#c79bff', // violet — profile flair
  contest: '#7fd99a', // green — contest entries
}

export function StoreView({ api }: { api: RewardsApi }) {
  return (
    <>
      <div className="rw-head">
        <h2 className="rw-h2" style={{ margin: 0 }}>
          Rewards store
        </h2>
        <div className="rw-kpi">
          <span className="rw-label">Rewards balance</span>
          <strong className="rw-coins">{coins(api.spendable)}</strong>
        </div>
      </div>
      <p className="rw-sub">
        Spend your rewards balance on bonuses, free plays, limit boosts and flair — coins and perks
        only.
      </p>

      <div className="rw-grid" role="list" aria-label="Store catalog">
        {STORE.map((item) => {
          const owned = api.isClaimed(item.id)
          const cantAfford = api.spendable < item.cost
          const disabled = owned || cantAfford
          const btnLabel = owned
            ? 'Owned'
            : cantAfford
              ? 'Not enough'
              : `Spend ${coins(item.cost)}`

          return (
            <article className="rw-card" role="listitem" key={item.id}>
              <div className="rw-head">
                <span
                  className="rw-icon"
                  style={{ ['--accent' as string]: KIND_COLOR[item.kind] } as CSSProperties}
                >
                  <item.icon aria-hidden="true" />
                </span>
                <span className="rw-pill">{STORE_KIND_LABEL[item.kind]}</span>
              </div>

              <span className="rw-tile-name">{item.name}</span>
              <span className="rw-row-desc">{item.desc}</span>

              <div className="rw-head" style={{ marginTop: 'auto' }}>
                <strong className="rw-coins">{coins(item.cost)}</strong>
                <button
                  type="button"
                  className="rw-btn rw-btn-primary"
                  disabled={disabled}
                  aria-label={
                    owned
                      ? `${item.name} — owned`
                      : cantAfford
                        ? `${item.name} — not enough coins, costs ${coins(item.cost)}`
                        : `Spend ${coins(item.cost)} on ${item.name}`
                  }
                  onClick={() => api.spend(item.id, item.cost, `Purchased ${item.name}`)}
                >
                  {btnLabel}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}
