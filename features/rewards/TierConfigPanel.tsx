/**
 * Tier Config — define the loyalty ladder: how many tiers, their names, the STATUS
 * threshold to reach each, and what each unlocks. Manager only. The player Ranks view +
 * tier math read straight from this. Balance & status only.
 */
import { useSyncExternalStore } from 'react'
import {
  getRewardsConfig,
  updateRewardsConfig,
  subscribeRewardsConfig,
  getRewardsConfigVersion,
} from '../../rewards/economy.js'
import type { TierConfig } from '../../rewards/data.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

export function TierConfigPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)
  const tiers = getRewardsConfig().tiers

  const update = (i: number, patch: Partial<TierConfig>) => {
    const next = tiers.map((t, j) => (j === i ? { ...t, ...patch } : t))
    updateRewardsConfig({ tiers: next })
  }
  const addTier = () => {
    const top = tiers[tiers.length - 1]
    const next: TierConfig = {
      id: `tier-${tiers.length + 1}`,
      name: `Tier ${tiers.length + 1}`,
      threshold: (top?.threshold ?? 0) * 2 + 1_000,
      perks: [],
    }
    updateRewardsConfig({ tiers: [...tiers, next] })
  }
  const removeTier = (i: number) => updateRewardsConfig({ tiers: tiers.filter((_, j) => j !== i) })

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Your loyalty ladder. Set each tier’s name, the status points to reach it, and what it
          unlocks (one perk per line). Status is earned from play and only ever goes up.
        </p>
      </header>

      <div className="rwa-tier-list">
        {tiers.map((t, i) => (
          <section className="feat-card rwa-tier" key={t.id}>
            <div className="rwa-tier-head">
              <input className="feat-input rwa-tier-name" value={t.name} onChange={(e) => update(i, { name: e.target.value })} aria-label={`Tier ${i + 1} name`} />
              <label className="feat-field rwa-tier-th">
                <span>Status to reach</span>
                <input
                  className="feat-input"
                  inputMode="numeric"
                  value={t.threshold}
                  onChange={(e) => update(i, { threshold: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })}
                  aria-label={`Tier ${i + 1} threshold`}
                />
              </label>
              {tiers.length > 1 && (
                <button className="feat-btn rwa-tier-del" onClick={() => removeTier(i)} aria-label={`Remove ${t.name}`}>
                  Remove
                </button>
              )}
            </div>
            <label className="feat-field">
              <span>Unlocks (one per line)</span>
              <textarea
                className="feat-input"
                rows={Math.max(2, t.perks.length)}
                value={t.perks.join('\n')}
                onChange={(e) => update(i, { perks: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                aria-label={`Tier ${i + 1} perks`}
              />
            </label>
          </section>
        ))}
      </div>

      <div className="feat-actions">
        <button className="feat-btn feat-btn-primary" onClick={addTier}>
          + Add tier
        </button>
      </div>
    </PanelShell>
  )
}
