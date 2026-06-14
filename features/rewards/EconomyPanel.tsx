/**
 * Economy & budget — the guardrails that keep rewards from inflating the coin supply, plus
 * the master on/off switch per program (CLAUDE.md §4). Manager only. Coins/status only.
 */
import { useSyncExternalStore } from 'react'
import {
  getRewardsConfig,
  updateRewardsConfig,
  setProgramEnabled,
  subscribeRewardsConfig,
  getRewardsConfigVersion,
  PROGRAM_KEYS,
  type ProgramKey,
} from '../../rewards/economy.js'
import { totalIssued, subscribeIssuance, getIssuanceVersion } from '../../rewards/comp.js'
import { coins } from '../../rewards/data.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

const PROGRAM_LABEL: Record<ProgramKey, string> = {
  tiers: 'Tiers / ranks',
  cashback: 'Cashback',
  daily: 'Daily & streak',
  missions: 'Missions',
  promos: 'Promotions',
  contests: 'Contests',
  store: 'Rewards store',
  leaderboards: 'Leaderboards',
}

export function EconomyPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)
  useSyncExternalStore(subscribeIssuance, getIssuanceVersion)
  const cfg = getRewardsConfig()
  const e = cfg.economy
  const issued = totalIssued()
  const capPct = e.totalIssuanceCap > 0 ? Math.min(100, (issued / e.totalIssuanceCap) * 100) : 0

  const setEcon = (patch: Partial<typeof e>) => updateRewardsConfig({ economy: { ...e, ...patch } })

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Caps and budgets so rewards can’t blow up the coin economy, and the master switch for each
          program. Everything is coins — no cash, no cash value.
        </p>
      </header>

      <section className="feat-kpis" aria-label="Issuance">
        <div className="feat-kpi">
          <span className="feat-label">Coins issued (all-time)</span>
          <strong>{coins(issued)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Total cap</span>
          <strong>{e.totalIssuanceCap > 0 ? coins(e.totalIssuanceCap) : 'Uncapped'}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Cap used</span>
          <strong>{e.totalIssuanceCap > 0 ? `${capPct.toFixed(1)}%` : '—'}</strong>
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Budget controls</h3>
        <div className="rwa-econ-grid">
          <Field label="Total issuance cap (coins, 0 = uncapped)" value={e.totalIssuanceCap} onChange={(v) => setEcon({ totalIssuanceCap: v })} />
          <Field label="Weekly budget (coins, 0 = uncapped)" value={e.weeklyBudget} onChange={(v) => setEcon({ weeklyBudget: v })} />
          <Field label="Cashback rate (basis points of coins wagered)" value={Math.round(e.cashbackRate * 10_000)} onChange={(v) => setEcon({ cashbackRate: Math.max(0, v) / 10_000 })} />
          <Field label="Agent weekly comp allowance (coins)" value={e.agentWeeklyCompAllowance} onChange={(v) => setEcon({ agentWeeklyCompAllowance: v })} />
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Programs</h3>
        <p className="feat-sub">Turn a program off and players stop seeing it immediately.</p>
        <div className="rwa-toggles">
          {PROGRAM_KEYS.map((k) => (
            <label key={k} className="feat-check">
              <input type="checkbox" checked={cfg.enabled[k]} onChange={(ev) => setProgramEnabled(k, ev.target.checked)} />
              {PROGRAM_LABEL[k]}
            </label>
          ))}
        </div>
      </section>
    </PanelShell>
  )
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="feat-field">
      <span>{label}</span>
      <input
        className="feat-input"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
      />
    </label>
  )
}
