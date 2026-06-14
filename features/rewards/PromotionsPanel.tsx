/**
 * Promotions Builder — create and run promos: balance-bonus campaigns, free-play drops, odds
 * boosts, top-up matches. Each is time-boxed with a live active toggle. Manager only.
 * Balance/perks only — no cash, no cash value.
 */
import { useState, useSyncExternalStore } from 'react'
import {
  getRewardsConfig,
  updateRewardsConfig,
  subscribeRewardsConfig,
  getRewardsConfigVersion,
  type Promo,
  type PromoKind,
} from '../../rewards/economy.js'
import { fmt } from '../../rewards/data.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

const KIND_LABEL: Record<PromoKind, string> = {
  bonus: 'Bonus balance',
  topup: 'Top-up match',
  freeplay: 'Free plays',
  oddsboost: 'Odds boost',
}
const DAY = 86_400_000
const NOW = 1_750_000_000_000

export function PromotionsPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)
  const promos = getRewardsConfig().promos

  const [name, setName] = useState('')
  const [kind, setKind] = useState<PromoKind>('bonus')
  const [amount, setAmount] = useState('1000')
  const [days, setDays] = useState('7')

  const save = (next: Promo[]) => updateRewardsConfig({ promos: next })
  const toggle = (id: string) => save(promos.map((p) => (p.id === id ? { ...p, active: !p.active } : p)))
  const remove = (id: string) => save(promos.filter((p) => p.id !== id))
  const create = () => {
    if (!name.trim()) return
    const p: Promo = {
      id: `promo-${name.trim().toLowerCase().replace(/\s+/g, '-')}-${promos.length}`,
      name: name.trim(),
      desc: `${KIND_LABEL[kind]} promotion.`,
      kind,
      amount: Number(amount) || 0,
      playthrough: kind === 'bonus' || kind === 'topup' ? 1 : 0,
      startsAt: NOW,
      endsAt: NOW + (Number(days) || 7) * DAY,
      active: true,
    }
    save([p, ...promos])
    setName('')
  }

  const amountLabel = (p: Promo) =>
    p.kind === 'oddsboost' ? `+${p.amount}%` : p.kind === 'freeplay' ? `${p.amount} plays` : fmt(p.amount)

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Build balance-bonus campaigns, free-play drops, odds boosts and top-up matches. Toggle one
          live and eligible players see it at once. Balance and perks only.
        </p>
      </header>

      <section className="feat-card">
        <h3 className="feat-h2">New promotion</h3>
        <div className="rwa-promo-form">
          <label className="feat-field rwa-grow">
            <span>Name</span>
            <input className="feat-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend Reload" />
          </label>
          <label className="feat-field">
            <span>Type</span>
            <select className="feat-input" value={kind} onChange={(e) => setKind(e.target.value as PromoKind)}>
              {(Object.keys(KIND_LABEL) as PromoKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="feat-field">
            <span>{kind === 'oddsboost' ? 'Boost %' : kind === 'freeplay' ? 'Plays' : 'Amount'}</span>
            <input className="feat-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <label className="feat-field">
            <span>Runs (days)</span>
            <input className="feat-input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ''))} />
          </label>
          <button className="feat-btn feat-btn-primary" onClick={create} disabled={!name.trim()}>
            Create
          </button>
        </div>
      </section>

      <div className="rwa-list">
        {promos.map((p) => (
          <section className={`feat-card rwa-row ${p.active ? '' : 'is-off'}`} key={p.id}>
            <div className="rwa-row-main">
              <span className="rwa-row-name">{p.name}</span>
              <span className="feat-sub">
                {KIND_LABEL[p.kind]} · {amountLabel(p)}
                {p.playthrough > 0 ? ` · ${p.playthrough}× playthrough` : ''}
              </span>
            </div>
            <button className={`feat-btn ${p.active ? 'feat-btn-primary' : ''}`} onClick={() => toggle(p.id)}>
              {p.active ? 'Live' : 'Off'}
            </button>
            <button className="feat-btn" onClick={() => remove(p.id)} aria-label={`Remove ${p.name}`}>
              ✕
            </button>
          </section>
        ))}
      </div>
    </PanelShell>
  )
}
