/**
 * Contests / leaderboard races — create races on a metric (profit / volume / streak / CLV),
 * over a window, for a COIN prize pool; start / stop / settle them. Manager only. The prize
 * pool and every prize are coins — never cash.
 */
import { useState, useSyncExternalStore } from 'react'
import {
  getRewardsConfig,
  updateRewardsConfig,
  subscribeRewardsConfig,
  getRewardsConfigVersion,
  type Contest,
  type ContestMetric,
} from '../../rewards/economy.js'
import { coins } from '../../rewards/data.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

const METRIC_LABEL: Record<ContestMetric, string> = {
  profit: 'Top profit',
  volume: 'Top volume',
  streak: 'Win streak',
  clv: 'Closing-line value',
}
const STATUSES: Contest['status'][] = ['scheduled', 'running', 'settled']
const DAY = 86_400_000
const NOW = 1_750_000_000_000

export function ContestsPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)
  const contests = getRewardsConfig().contests

  const [name, setName] = useState('')
  const [metric, setMetric] = useState<ContestMetric>('profit')
  const [pool, setPool] = useState('50000')
  const [days, setDays] = useState('7')

  const save = (next: Contest[]) => updateRewardsConfig({ contests: next })
  const setStatus = (id: string, status: Contest['status']) =>
    save(contests.map((c) => (c.id === id ? { ...c, status } : c)))
  const setPoolFor = (id: string, p: number) =>
    save(contests.map((c) => (c.id === id ? { ...c, prizePoolCoins: p } : c)))
  const remove = (id: string) => save(contests.filter((c) => c.id !== id))
  const create = () => {
    if (!name.trim()) return
    const poolCoins = Number(pool) || 0
    const c: Contest = {
      id: `contest-${name.trim().toLowerCase().replace(/\s+/g, '-')}-${contests.length}`,
      name: name.trim(),
      metric,
      startsAt: NOW,
      endsAt: NOW + (Number(days) || 7) * DAY,
      prizePoolCoins: poolCoins,
      prizes: [0.4, 0.24, 0.16, 0.12, 0.08].map((f) => Math.round(poolCoins * f)),
      status: 'running',
    }
    save([c, ...contests])
    setName('')
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Time-boxed races for a coin prize pool. Pick the metric and window, start it, watch the
          standings (player side), then settle to split the pool in coins.
        </p>
      </header>

      <section className="feat-card">
        <h3 className="feat-h2">New contest</h3>
        <div className="rwa-promo-form">
          <label className="feat-field rwa-grow">
            <span>Name</span>
            <input className="feat-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekly Profit Race" />
          </label>
          <label className="feat-field">
            <span>Metric</span>
            <select className="feat-input" value={metric} onChange={(e) => setMetric(e.target.value as ContestMetric)}>
              {(Object.keys(METRIC_LABEL) as ContestMetric[]).map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="feat-field">
            <span>Prize pool (coins)</span>
            <input className="feat-input" inputMode="numeric" value={pool} onChange={(e) => setPool(e.target.value.replace(/[^\d]/g, ''))} />
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
        {contests.map((c) => (
          <section className="feat-card rwa-row" key={c.id}>
            <div className="rwa-row-main">
              <span className="rwa-row-name">{c.name}</span>
              <span className="feat-sub">
                {METRIC_LABEL[c.metric]} · pool {coins(c.prizePoolCoins)}
              </span>
            </div>
            <label className="feat-field rwa-pool">
              <span>Pool</span>
              <input className="feat-input" inputMode="numeric" value={c.prizePoolCoins} onChange={(e) => setPoolFor(c.id, Number(e.target.value.replace(/[^\d]/g, '')) || 0)} />
            </label>
            <select className="feat-input rwa-status" value={c.status} onChange={(e) => setStatus(c.id, e.target.value as Contest['status'])} aria-label={`${c.name} status`}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button className="feat-btn" onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`}>
              ✕
            </button>
          </section>
        ))}
      </div>
    </PanelShell>
  )
}
