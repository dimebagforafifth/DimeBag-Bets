/**
 * Tier Config — define the loyalty ladder: how many tiers, their names, the STATUS
 * threshold to reach each, and what each unlocks. Manager only. The player Ranks view +
 * tier math read straight from this. Balance & status only.
 *
 * Friendlier editor: a live ladder preview up top, a warning + one-click fix when the
 * thresholds aren't in ascending order, drag-free reorder (↑/↓), and perks edited as
 * removable chips instead of a raw text box.
 */
import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import {
  getRewardsConfig,
  updateRewardsConfig,
  subscribeRewardsConfig,
  getRewardsConfigVersion,
} from './economy.js'
import { tierVisual, num, type TierConfig } from './data.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

export function TierConfigPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)
  const tiers = getRewardsConfig().tiers

  const save = (next: TierConfig[]) => updateRewardsConfig({ tiers: next })
  const update = (i: number, patch: Partial<TierConfig>) =>
    save(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= tiers.length) return
    const next = [...tiers]
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  const sortByThreshold = () => save([...tiers].sort((a, b) => a.threshold - b.threshold))
  const removeTier = (i: number) => save(tiers.filter((_, j) => j !== i))
  const addTier = () => {
    const top = tiers[tiers.length - 1]
    save([
      ...tiers,
      {
        id: `tier-${tiers.length + 1}`,
        name: `Tier ${tiers.length + 1}`,
        threshold: (top?.threshold ?? 0) * 2 + 1_000,
        perks: [],
      },
    ])
  }

  // ascending = each tier's threshold is strictly above the one before it (in list order)
  const ascending = tiers.every((t, i) => i === 0 || tiers[i - 1].threshold < t.threshold)
  const ladder = [...tiers].sort((a, b) => a.threshold - b.threshold)

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Your loyalty ladder. Set each tier’s name, the status points to reach it, and what it
          unlocks. Status is earned from play and only ever goes up — players climb tiers in
          threshold order.
        </p>
      </header>

      {/* live preview of the ladder players actually see (threshold order) */}
      <section className="feat-card" aria-label="Ladder preview">
        <h3 className="feat-h2">Ladder preview</h3>
        <div className="rwa-ladder">
          {ladder.map((t) => {
            const v = tierVisual(t.id)
            const Icon = v.icon
            return (
              <div key={t.id} className="rwa-ladder-step" style={{ ['--accent' as string]: v.color } as CSSProperties}>
                <span className="rwa-ladder-emblem">
                  <Icon aria-hidden="true" size={16} />
                </span>
                <span className="rwa-ladder-name">{t.name}</span>
                <span className="rwa-ladder-th">{t.threshold === 0 ? 'Start' : `${num(t.threshold)} status`}</span>
              </div>
            )
          })}
        </div>
      </section>

      {!ascending && (
        <div className="rwa-warn" role="status">
          <span>Thresholds aren’t in ascending order — players reach tiers by status, so the order
            below should climb. </span>
          <button className="feat-btn" onClick={sortByThreshold}>
            Sort by threshold
          </button>
        </div>
      )}

      <div className="rwa-tier-list">
        {tiers.map((t, i) => {
          const v = tierVisual(t.id)
          return (
            <section className="feat-card rwa-tier" key={t.id}>
              <div className="rwa-tier-head">
                <div className="rwa-move" aria-label="Reorder">
                  <button className="rwa-iconbtn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${t.name} up`}>
                    ↑
                  </button>
                  <button className="rwa-iconbtn" onClick={() => move(i, 1)} disabled={i === tiers.length - 1} aria-label={`Move ${t.name} down`}>
                    ↓
                  </button>
                </div>
                <span className="rwa-dot" style={{ background: v.color }} aria-hidden="true" />
                <input
                  className="feat-input rwa-tier-name"
                  value={t.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  aria-label={`Tier ${i + 1} name`}
                />
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

              <PerkEditor perks={t.perks} onChange={(perks) => update(i, { perks })} tierName={t.name} />
            </section>
          )
        })}
      </div>

      <div className="feat-actions">
        <button className="feat-btn feat-btn-primary" onClick={addTier}>
          + Add tier
        </button>
      </div>
    </PanelShell>
  )
}

/** Perks as removable chips + an inline add field (friendlier than a raw textarea). */
function PerkEditor({
  perks,
  onChange,
  tierName,
}: {
  perks: string[]
  onChange: (perks: string[]) => void
  tierName: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v) return
    onChange([...perks, v])
    setDraft('')
  }
  return (
    <div className="rwa-perks">
      <span className="feat-label">Unlocks</span>
      <div className="rwa-chiprow">
        {perks.length === 0 && <span className="feat-sub" style={{ margin: 0 }}>No perks yet.</span>}
        {perks.map((p, j) => (
          <span className="rwa-chip" key={`${p}-${j}`}>
            {p}
            <button
              className="rwa-chip-x"
              onClick={() => onChange(perks.filter((_, k) => k !== j))}
              aria-label={`Remove perk "${p}"`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="rwa-chip-add">
        <input
          className="feat-input"
          value={draft}
          placeholder="Add a perk…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          aria-label={`Add a perk to ${tierName}`}
        />
        <button className="feat-btn" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}
