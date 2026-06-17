/**
 * Commission panel for an agent / master agent inside the per-member editor.
 *
 * The manager picks HOW this agent is paid — split, profit-share, or redline — and the
 * rate. It writes through the org setter inside `mutateBook` (persist + notify), exactly
 * like every other lever in the editor; no account or ledger is touched here. Settlement
 * (`settleOrgWeek`) is what grades and distributes the commission under the chosen model.
 * Credits (integer cents) only.
 */
import { useState } from 'react'
import {
  setCommissionModel,
  commissionConfigOf,
  type CommissionModel,
  type Member,
} from '../../org/index.js'
import { getBook, mutateBook } from '../../app/book-store.js'
import { formatMoney } from '../../games/shared/money.js'

const MODELS: { value: CommissionModel; label: string; hint: string }[] = [
  {
    value: 'split',
    label: 'Split',
    hint: 'Partnership: a flat % of the player figure either way — earns on roster losses, shares roster wins.',
  },
  {
    value: 'profit_share',
    label: 'Profit share',
    hint: 'A % of net player losses only. Nothing owed on a week the roster beats the book.',
  },
  {
    value: 'redline',
    label: 'Redline (make-up)',
    hint: 'Earns only after a losing week’s red figure is cleared. The carryover banks until it’s made up.',
  },
]

export function CommissionEditor({ member }: { member: Member }) {
  const current = commissionConfigOf(member)
  const [model, setModel] = useState<CommissionModel | ''>(current?.model ?? '')
  const [pct, setPct] = useState(current ? String(current.pct) : '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const carryover =
    member.commission?.model === 'redline' ? (member.commission.carryoverCents ?? 0) : 0
  const activeHint = MODELS.find((m) => m.value === model)?.hint

  const guard = (fn: () => void, ok: string) => {
    setError(null)
    setSaved(null)
    try {
      fn()
      setSaved(ok)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const save = () => {
    if (model === '') {
      guard(
        () => mutateBook(() => setCommissionModel(getBook(), member.id, null)),
        'Commission cleared.',
      )
      return
    }
    const p = Number(pct)
    guard(
      () => mutateBook(() => setCommissionModel(getBook(), member.id, { model, pct: p })),
      'Commission updated.',
    )
  }

  return (
    <section className="agt-edit" aria-label="Commission">
      <span className="feat-label">Commission model</span>
      <div className="feat-actions">
        <select
          className="feat-input"
          value={model}
          onChange={(e) => setModel(e.target.value as CommissionModel | '')}
          aria-label="Commission model"
        >
          <option value="">None</option>
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          className="feat-input"
          type="number"
          step="0.5"
          min="0"
          max="100"
          placeholder="%"
          value={pct}
          disabled={model === ''}
          onChange={(e) => setPct(e.target.value)}
          aria-label="Commission percent"
        />
        <button type="button" className="feat-btn" onClick={save}>
          Save
        </button>
      </div>
      {activeHint && <p className="feat-sub">{activeHint}</p>}
      {model === 'redline' && carryover < 0 && (
        <p className="feat-sub">
          Red figure to make up: <strong className="feat-down">{formatMoney(carryover)}</strong> —
          the agent earns nothing until this clears.
        </p>
      )}
      {error && (
        <p className="feat-empty feat-down" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="feat-saved" role="status">
          {saved}
        </p>
      )}
    </section>
  )
}
