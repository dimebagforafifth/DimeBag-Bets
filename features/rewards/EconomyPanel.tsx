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
} from '../../rewards/economy.js'
import { totalIssued, subscribeIssuance, getIssuanceVersion } from '../../rewards/comp.js'
import { fmt } from '../../rewards/data.js'
import { PanelShell } from '../_desk/shared.js'
import './rewards-admin.css'

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
