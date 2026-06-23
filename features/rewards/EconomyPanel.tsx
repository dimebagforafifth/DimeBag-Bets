/**
 * Economy & budget — the guardrails that keep rewards from inflating the balance supply,
 * plus the master on/off switch per program (CLAUDE.md §4). Manager only. Balance & status
 * only.
 */
import { useSyncExternalStore } from 'react'
import {
  getRewardsConfig,
  updateRewardsConfig,
  subscribeRewardsConfig,
  getRewardsConfigVersion,
} from './economy.js'
import { totalIssued, subscribeIssuance, getIssuanceVersion } from './comp.js'
import { fmt } from './data.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

export function EconomyPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeRewardsConfig, getRewardsConfigVersion)
  useSyncExternalStore(subscribeIssuance, getIssuanceVersion)
  const cfg = getRewardsConfig()
  const e = cfg.economy
  const l = cfg.loyalty
  const issued = totalIssued()
  const capPct = e.totalIssuanceCap > 0 ? Math.min(100, (issued / e.totalIssuanceCap) * 100) : 0

  const setEcon = (patch: Partial<typeof e>) => updateRewardsConfig({ economy: { ...e, ...patch } })
  const setLoyalty = (patch: Partial<typeof l>) => updateRewardsConfig({ loyalty: { ...l, ...patch } })

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Caps and budgets so rewards can’t blow up the balance economy. Everything is balance —
          never cash. (Turn features on/off and schedule them in <strong>Feature Publishing</strong>.)
        </p>
      </header>

      <section className="feat-kpis" aria-label="Issuance">
        <div className="feat-kpi">
          <span className="feat-label">Issued (all-time)</span>
          <strong>{fmt(issued)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Total cap</span>
          <strong>{e.totalIssuanceCap > 0 ? fmt(e.totalIssuanceCap) : 'Uncapped'}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Cap used</span>
          <strong>{e.totalIssuanceCap > 0 ? `${capPct.toFixed(1)}%` : '—'}</strong>
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Budget controls</h3>
        <div className="rwa-econ-grid">
          <Field label="Total issuance cap (0 = uncapped)" value={e.totalIssuanceCap} onChange={(v) => setEcon({ totalIssuanceCap: v })} />
          <Field label="Weekly budget (0 = uncapped)" value={e.weeklyBudget} onChange={(v) => setEcon({ weeklyBudget: v })} />
          <Field label="Cashback rate (basis points of amount wagered)" value={Math.round(e.cashbackRate * 10_000)} onChange={(v) => setEcon({ cashbackRate: Math.max(0, v) / 10_000 })} />
          <Field label="Agent weekly comp allowance" value={e.agentWeeklyCompAllowance} onChange={(v) => setEcon({ agentWeeklyCompAllowance: v })} />
        </div>
      </section>

      <section className="feat-card">
        <h3 className="feat-h2">Rewards hub — what players get</h3>
        <p className="feat-sub">
          The live values behind the player Rewards hub. Change a number and the hub updates for
          every player. Credits only — no cash.
        </p>
        <div className="rwa-econ-grid">
          <Field label="Rakeback rate (% of credits wagered)" value={Math.round(l.rakebackRate * 100)} onChange={(v) => setLoyalty({ rakebackRate: Math.max(0, v) / 100 })} />
          <Field label="Daily bonus — base credits" value={l.dailyBase} onChange={(v) => setLoyalty({ dailyBase: v })} />
          <Field label="Daily bonus — credits per streak day" value={l.dailyStreakStep} onChange={(v) => setLoyalty({ dailyStreakStep: v })} />
          <Field label="Daily bonus — streak cap (days)" value={l.dailyMaxStreak} onChange={(v) => setLoyalty({ dailyMaxStreak: v })} />
          <Field label="Daily cooldown (hours)" value={Math.round(l.dailyCooldownMs / 3_600_000)} onChange={(v) => setLoyalty({ dailyCooldownMs: Math.max(1, v) * 3_600_000 })} />
          <Field label="Warm-up bonus — locked credits" value={l.warmupGrant} onChange={(v) => setLoyalty({ warmupGrant: v })} />
          <Field label="Warm-up — wager multiple to unlock" value={l.warmupWagerX} onChange={(v) => setLoyalty({ warmupWagerX: Math.max(1, v) })} />
          <Field label="Free spin — min payout (credits)" value={l.spinMin} onChange={(v) => setLoyalty({ spinMin: v })} />
          <Field label="Free spin — max payout (credits)" value={l.spinMax} onChange={(v) => setLoyalty({ spinMax: v })} />
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
