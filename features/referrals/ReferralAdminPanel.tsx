/**
 * Referral Program (operator) — set the reward + qualifying rule, toggle the program on/off, and
 * watch referral activity. Manager-gated config (agents inherit it); the activity table is a read
 * over the referral store. No money moves here — rewards are issued by core when a referee
 * qualifies (referrals/store), audited. Off-by-default: the program ships disabled.
 */

import { useState, useSyncExternalStore } from 'react'
import { PanelShell } from '../_desk/shared.js'
import { getBook, getBookVersion, subscribeBook } from '../../app/book-store.js'
import { formatMoney, toCents } from '../../games/shared/money.js'
import {
  allReferrals,
  canConfigureReferrals,
  getReferralConfig,
  getReferralsVersion,
  setReferralConfig,
  subscribeReferrals,
} from '../../referrals/index.js'
import type { ReferralStatus } from '../../referrals/index.js'

const nameOf = (id: string | null): string => (id ? (getBook().members[id]?.name ?? id) : '—')

const STATUS_LABEL: Record<ReferralStatus, string> = {
  pending: 'Pending',
  qualified: 'Qualified',
  rewarded: 'Rewarded',
}

export function ReferralAdminPanel({ onBack }: { onBack: () => void }) {
  useSyncExternalStore(subscribeReferrals, getReferralsVersion, getReferralsVersion)
  useSyncExternalStore(subscribeBook, getBookVersion, getBookVersion)

  const config = getReferralConfig()
  const canEdit = canConfigureReferrals()
  const rows = allReferrals()

  const [reward, setReward] = useState(String(config.rewardCents / 100))
  const [minSettled, setMinSettled] = useState(String(config.minSettledWagers))
  const [msg, setMsg] = useState<string | null>(null)

  const rewarded = rows.filter((r) => r.status === 'rewarded')
  const issuedCents = rewarded.reduce((s, r) => s + r.rewardCents * 2, 0)

  const save = (patch: Parameters<typeof setReferralConfig>[0]) => {
    try {
      setReferralConfig(patch)
      setMsg('Saved.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const applyReward = () => {
    const v = Number(reward)
    if (!Number.isFinite(v) || v < 0) {
      setMsg('Enter a reward amount.')
      return
    }
    save({ rewardCents: toCents(v), minSettledWagers: Math.max(1, Number(minSettled) || 1) })
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Reward players for inviting friends. When a referee places their first settled bet, both
          they and the referrer get the reward — issued through the figure and audited. Off until
          you switch it on. Credits only.
        </p>
      </header>

      <section className="feat-card" aria-label="Referral program">
        <label className="feat-check">
          <input
            type="checkbox"
            checked={config.enabled}
            disabled={!canEdit}
            onChange={(e) => save({ enabled: e.target.checked })}
          />
          Referral program {config.enabled ? 'on' : 'off'}
        </label>

        <div className="feat-field">
          <span className="feat-label">Reward per person ($)</span>
          <input
            className="feat-input"
            inputMode="decimal"
            value={reward}
            disabled={!canEdit}
            onChange={(e) => setReward(e.target.value)}
            aria-label="Reward per person (dollars)"
          />
        </div>

        <div className="feat-field">
          <span className="feat-label">Qualify after (settled bets)</span>
          <input
            className="feat-input"
            inputMode="numeric"
            value={minSettled}
            disabled={!canEdit}
            onChange={(e) => setMinSettled(e.target.value)}
            aria-label="Qualifying settled bets"
          />
        </div>

        <button className="feat-btn feat-btn-primary" onClick={applyReward} disabled={!canEdit}>
          Save program
        </button>
        {!canEdit && <p className="feat-empty">Set by the manager — view only.</p>}
        {msg && <p className="feat-saved">{msg}</p>}
      </section>

      <section className="feat-kpis" aria-label="Referral summary">
        <div className="feat-kpi">
          <span className="feat-label">Invites</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Rewarded</span>
          <strong>{rewarded.length}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">Credits issued</span>
          <strong>{formatMoney(issuedCents)}</strong>
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="feat-empty">No referral activity yet.</p>
      ) : (
        <div className="feat-card">
          <table className="feat-table" aria-label="Referral activity">
            <thead>
              <tr>
                <th>Referrer</th>
                <th>Referee</th>
                <th>Status</th>
                <th className="num">Reward</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.code}-${r.refereeId}`}>
                  <td>{nameOf(r.referrerId)}</td>
                  <td>{nameOf(r.refereeId)}</td>
                  <td>
                    <span className={`feat-label ${r.status === 'rewarded' ? 'feat-up' : ''}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="num">{formatMoney(r.rewardCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  )
}
