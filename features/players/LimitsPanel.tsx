import { useState, useSyncExternalStore } from 'react'
import { PlayerSearch } from '../../org/ui/PlayerLookup.js'
import { setMaxWager, setMinWager } from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import { formatMoney, toCents } from '../../games/shared/money.js'
import { ScopeBar, inScope, ALL_SCOPE } from '../_desk/scope.js'
import './players.css'

/**
 * Limits — per-player wager caps. Search a player (scoped to the whole book or one
 * agent's roster), then set/clear their max and min bet through `org.setMaxWager` /
 * `org.setMinWager` (the core enforces them on placement).
 */
export function LimitsPanel() {
  useSyncExternalStore(subscribeBook, getBookVersion)
  const org = getBook()
  const [scope, setScope] = useState(ALL_SCOPE)
  const [id, setId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const member = id ? org.members[id] : null
  const guard = (fn: () => void) => {
    setError(null)
    try {
      fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="feat">
      <ScopeBar org={org} value={scope} onChange={setScope} />
      <PlayerSearch org={org} onSelect={setId} restrictTo={inScope(org, scope)} />
      {member && member.role === 'player' ? (
        <div className="feat-card">
          <h3 className="feat-h">{member.name} · wager caps</h3>
          <CapField
            label="Max bet (dollars)"
            value={member.account.maxWager}
            onSet={(c) => guard(() => mutateBook(() => setMaxWager(org, member.id, c)))}
          />
          <CapField
            label="Min bet (dollars)"
            value={member.account.minWager}
            onSet={(c) => guard(() => mutateBook(() => setMinWager(org, member.id, c)))}
          />
          {error && <p className="feat-err">{error}</p>}
        </div>
      ) : (
        <p className="feat-empty">Search a player to set wager caps.</p>
      )}
    </div>
  )
}

function CapField({
  label,
  value,
  onSet,
}: {
  label: string
  value: number | null | undefined
  onSet: (cents: number | null) => void
}) {
  const [draft, setDraft] = useState(value != null ? String(value / 100) : '')
  return (
    <div className="feat-cap">
      <label className="feat-field">
        <span>{label}</span>
        <input
          className="feat-input"
          inputMode="decimal"
          placeholder="none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <span className="feat-cap-cur">{value != null ? `now ${formatMoney(value)}` : 'no cap'}</span>
      <button
        className="feat-btn is-primary"
        type="button"
        onClick={() => onSet(draft.trim() === '' ? null : toCents(Number(draft) || 0))}
      >
        Set
      </button>
      <button
        className="feat-btn"
        type="button"
        onClick={() => {
          setDraft('')
          onSet(null)
        }}
      >
        Clear
      </button>
    </div>
  )
}
