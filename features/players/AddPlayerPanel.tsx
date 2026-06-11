import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react'
import {
  addMember,
  eligibleParents,
  setCommissionPct,
  type Role,
} from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import { toCents } from '../../games/shared/money.js'
import './players.css'

/** The customer types an operator can onboard, in tier order. ('manager' is the book
 *  root — set once at book creation — so it is never an Add-Customer option.) */
const TYPES: { role: Exclude<Role, 'manager'>; label: string }[] = [
  { role: 'player', label: 'Player' },
  { role: 'agent', label: 'Agent' },
  { role: 'subagent', label: 'Master Agent' },
]
const ROLE_LABEL: Record<Role, string> = {
  manager: 'Manager',
  subagent: 'Master Agent',
  agent: 'Agent',
  player: 'Player',
}

/**
 * Add Customer — onboard a Player, Agent, or Master Agent under an eligible parent
 * (the org tier rules drive the parent list: a master agent sits under the manager;
 * an agent under a master agent or the manager; a player under any of them). Credit is
 * the account's line — for an agent it is the allowance/budget they can hand down to
 * their own roster (the org credit-waterfall enforces it fits the parent's headroom).
 * Agents/master agents can carry a commission split. Routes through `org.addMember`;
 * dollars only.
 */
export function AddPlayerPanel({ onBack }: { onBack: () => void }) {
  const bookV = useSyncExternalStore(subscribeBook, getBookVersion)

  const [role, setRole] = useState<Exclude<Role, 'manager'>>('player')
  const [parentId, setParentId] = useState('')
  const [name, setName] = useState('')
  const [credit, setCredit] = useState('200')
  const [commission, setCommission] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  const isAgent = role === 'agent' || role === 'subagent'

  // Eligible parents for the chosen role — recomputed as the book changes.
  const parents = useMemo(() => eligibleParents(getBook(), role), [role, bookV])
  const parent = parents.some((p) => p.id === parentId) ? parentId : (parents[0]?.id ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setAdded(null)
    const nm = name.trim()
    if (!nm) {
      setError('Enter a name.')
      return
    }
    if (!parent) {
      setError('No eligible parent for this type.')
      return
    }
    const pct = commission.trim() === '' ? null : Number(commission)
    if (isAgent && pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      setError('Commission must be a percent 0–100.')
      return
    }
    try {
      mutateBook((org) => {
        const m = addMember(org, role, parent, {
          name: nm,
          creditLimit: toCents(Number(credit) || 0),
          profile: email.trim() ? { email: email.trim() } : undefined,
        })
        if (isAgent && pct) setCommissionPct(org, m.id, pct)
      })
      setAdded(`${ROLE_LABEL[role]} “${nm}”`)
      setName('')
      setEmail('')
      setCredit('200')
      setCommission('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="feat">
      <form className="feat-form" onSubmit={submit}>
        <h3 className="feat-h">Add a customer</h3>

        <div className="addc-grid">
          <label className="feat-field">
            <span>Type</span>
            <select
              className="feat-input"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Exclude<Role, 'manager'>)
                setParentId('') // reset to the first eligible parent for the new role
              }}
            >
              {TYPES.map((t) => (
                <option key={t.role} value={t.role}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="feat-field">
            <span>Under</span>
            <select
              className="feat-input"
              value={parent}
              onChange={(e) => setParentId(e.target.value)}
            >
              {parents.length === 0 && <option value="">— no eligible parent —</option>}
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({ROLE_LABEL[p.role]})
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="feat-field">
          <span>Name</span>
          <input
            className="feat-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <div className="addc-grid">
          <label className="feat-field">
            <span>{isAgent ? 'Allowance — credit budget (dollars)' : 'Credit line (dollars)'}</span>
            <input
              className="feat-input"
              inputMode="decimal"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
            />
          </label>

          {isAgent && (
            <label className="feat-field">
              <span>Commission % (optional)</span>
              <input
                className="feat-input"
                inputMode="decimal"
                placeholder="e.g. 25"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </label>
          )}
        </div>

        <label className="feat-field">
          <span>Email (optional)</span>
          <input
            className="feat-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {added && <p className="feat-ok">Added {added}. Add another, or go back.</p>}
        {error && <p className="feat-err">{error}</p>}

        <div className="feat-actions">
          <button className="feat-btn is-primary" type="submit" disabled={!parent}>
            Add {ROLE_LABEL[role].toLowerCase()}
          </button>
          <button className="feat-btn" type="button" onClick={onBack}>
            Done
          </button>
        </div>
      </form>
    </div>
  )
}
