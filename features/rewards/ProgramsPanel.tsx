/**
 * Challenges/Missions + Daily/Streak config — the recurring earn loops. Define the daily
 * login cycle amounts and the missions players complete. Manager only. Balance & status only.
 */
import { useSyncExternalStore } from 'react'
import {
  getRewardsConfig,
  updateRewardsConfig,
  subscribeRewardsConfig,
  getRewardsConfigVersion,
  type MissionDef,
} from '../../rewards/economy.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

export function ProgramsPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)
  const cfg = getRewardsConfig()
  const daily = cfg.daily
  const missions = cfg.missions

  const setDailyAmount = (i: number, v: number) =>
    updateRewardsConfig({ daily: { ...daily, rewards: daily.rewards.map((r, j) => (j === i ? v : r)) } })
  const setMission = (i: number, patch: Partial<MissionDef>) =>
    updateRewardsConfig({ missions: missions.map((m, j) => (j === i ? { ...m, ...patch } : m)) })

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          The daily login cycle and the missions players complete. Every reward is balance.
        </p>
      </header>

      <section className="feat-card">
        <div className="feat-head">
          <h3 className="feat-h2" style={{ margin: 0 }}>
            Daily &amp; streak
          </h3>
          <label className="feat-check">
            <input type="checkbox" checked={daily.enabled} onChange={(e) => updateRewardsConfig({ daily: { ...daily, enabled: e.target.checked } })} />
            Enabled
          </label>
        </div>
        <p className="feat-sub">Balance for each day of the 7-day streak (day 7 is the streak payout).</p>
        <div className="rwa-daily-grid">
          {daily.rewards.map((r, i) => (
            <label key={i} className="feat-field rwa-day">
              <span>Day {i + 1}</span>
              <input className="feat-input" inputMode="numeric" value={r} onChange={(e) => setDailyAmount(i, Number(e.target.value.replace(/[^\d]/g, '')) || 0)} aria-label={`Day ${i + 1} reward`} />
            </label>
          ))}
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Missions</h3>
        <div className="rwa-list">
          {missions.map((m, i) => (
            <div className={`rwa-mission ${m.active ? '' : 'is-off'}`} key={m.id}>
              <input className="feat-input rwa-grow" value={m.name} onChange={(e) => setMission(i, { name: e.target.value })} aria-label={`Mission ${i + 1} name`} />
              <label className="feat-field rwa-pool">
                <span>Goal</span>
                <input className="feat-input" inputMode="numeric" value={m.goal} onChange={(e) => setMission(i, { goal: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} />
              </label>
              <label className="feat-field rwa-pool">
                <span>Reward</span>
                <input className="feat-input" inputMode="numeric" value={m.reward} onChange={(e) => setMission(i, { reward: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} />
              </label>
              <label className="feat-check">
                <input type="checkbox" checked={m.active} onChange={(e) => setMission(i, { active: e.target.checked })} />
                On
              </label>
            </div>
          ))}
        </div>
      </section>
    </PanelShell>
  )
}
