import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  agentOf,
  eligibleParents,
  reassign,
  setActive,
  setCreditLimit,
  type Member,
  type Org,
} from '../../org/index.js'
import {
  credentialStatus,
  requestPasswordReset,
  subscribeCredentials,
  credentialsVersion,
} from '../../auth/index.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import { toCents } from '../../games/shared/money.js'
import { PanelShell, Figure } from '../_desk/shared.js'
import { ScopeBar, scopedPlayers, ALL_SCOPE } from '../_desk/scope.js'
import './players.css'

/**
 * Customer Admin — the PPH player grid (CLAUDE.md §4). One scoped, filterable table of
 * every player with the levers an operator actually reaches for: inline credit-line
 * editing, account status (active / locked), and moving a player between agents — each
 * available per-row AND as a bulk action over a selection (set credit for all selected,
 * lock/activate, move to an agent, send a reset).
 *
 * The login column shows a redacted STATUS only (has-login / reset-sent) with a
 * "Send reset" action — the password itself never surfaces here; auth lives in Supabase
 * (auth/credentials). Every money/standing edit routes through the org mutators via
 * mutateBook (persisted + audited downstream); dollars only.
 */

type StatusFilter = 'all' | 'active' | 'locked'

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'locked', label: 'Locked' },
]

const ROLE_LABEL: Record<string, string> = {
  manager: 'Manager',
  subagent: 'Master',
  agent: 'Agent',
  player: 'Player',
}

export function CustomerAdminPanel({ onBack }: { onBack: () => void }) {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const cv = useSyncExternalStore(subscribeCredentials, credentialsVersion)
  const org = getBook()

  const [scope, setScope] = useState(ALL_SCOPE)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // The eligible "move to" parents for a player (manager + every agent / master agent).
  const parents = useMemo(() => eligibleParents(org, 'player'), [bv])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return scopedPlayers(org, scope)
      .filter((p) => (statusFilter === 'all' ? true : statusFilter === 'active' ? p.active : !p.active))
      .filter((p) => (term ? p.name.toLowerCase().includes(term) : true))
      .sort((a, b) => a.name.localeCompare(b.name))
    // bv/cv are the change signals
  }, [org, scope, q, statusFilter, bv, cv])

  // Drop any selected ids that fell out of the current view (scope/filter change).
  const visibleIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows])
  const selectedVisible = useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)),
    [selected, visibleIds],
  )
  const allChecked = rows.length > 0 && selectedVisible.length === rows.length

  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () =>
    setSelected(() => (allChecked ? new Set() : new Set(rows.map((r) => r.id))))
  const clearSel = () => setSelected(new Set())

  const flash = (msg: string) => {
    setError(null)
    setDone(msg)
  }

  // Apply an org mutation across every selected player, tallying ok / failures so one
  // bad row (e.g. credit headroom) never silently swallows the rest. Returns the tally;
  // callers phrase the result. `verb` already reads as a past-tense summary.
  const bulkMutate = (verb: string, fn: (org: Org, id: string) => void) => {
    const ids = selectedVisible
    if (ids.length === 0) return
    let ok = 0
    const fails: string[] = []
    mutateBook((o) => {
      for (const id of ids) {
        try {
          fn(o, id)
          ok += 1
        } catch (e) {
          fails.push(`${o.members[id]?.name ?? id}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    })
    setDone(`${verb} ${ok} customer${ok === 1 ? '' : 's'}.`)
    setError(fails.length ? `${fails.length} skipped — ${fails[0]}` : null)
  }

  // --- Bulk credit ---
  const [bulkCredit, setBulkCredit] = useState('')
  const applyBulkCredit = () => {
    const v = Number(bulkCredit)
    if (!Number.isFinite(v) || v < 0) {
      setError('Enter a credit amount (dollars) to apply.')
      return
    }
    bulkMutate('Set credit on', (o, id) => setCreditLimit(o, id, toCents(v)))
    setBulkCredit('')
  }

  // --- Bulk move ---
  const [bulkParent, setBulkParent] = useState('')
  const applyBulkMove = () => {
    if (!bulkParent) {
      setError('Pick an agent to move the selection under.')
      return
    }
    const name = org.members[bulkParent]?.name ?? 'agent'
    bulkMutate(`Moved under ${name},`, (o, id) => reassign(o, id, bulkParent))
  }

  // --- Bulk reset (async; redacted) ---
  const sendBulkReset = async () => {
    const ids = selectedVisible
    let ok = 0
    const fails: string[] = []
    for (const id of ids) {
      try {
        await requestPasswordReset(id, Date.now())
        ok += 1
      } catch (e) {
        fails.push(org.members[id]?.name ?? id)
      }
    }
    flash(`Sent a reset to ${ok} customer${ok === 1 ? '' : 's'}.`)
    if (fails.length) setError(`${fails.length} had no login — ${fails.slice(0, 2).join(', ')}`)
  }

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Every player in one grid. Edit a credit line in place, lock or activate an account, or
          move a player to another agent — one at a time, or across a whole selection. The login
          column shows status only; resets go out by email (no password is ever shown).
        </p>
      </header>

      <ScopeBar org={org} value={scope} onChange={setScope} />

      <div className="custadm-tools">
        <input
          className="feat-input custadm-search"
          placeholder="Search players…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mdsk-chips" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`mdsk-chip ${f.value === statusFilter ? 'is-on' : ''}`}
              aria-pressed={f.value === statusFilter}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {selectedVisible.length > 0 && (
        <div className="custadm-bulk" role="group" aria-label="Bulk actions">
          <span className="custadm-bulk-n">{selectedVisible.length} selected</span>
          <span className="custadm-bulk-grp">
            <input
              className="feat-input custadm-bulk-input"
              inputMode="decimal"
              placeholder="Credit $"
              value={bulkCredit}
              onChange={(e) => setBulkCredit(e.target.value)}
              aria-label="Bulk credit amount"
            />
            <button className="feat-btn" onClick={applyBulkCredit}>
              Set credit
            </button>
          </span>
          <button className="feat-btn" onClick={() => bulkMutate('Activated', (o, id) => setActive(o, id, true))}>
            Activate
          </button>
          <button className="feat-btn" onClick={() => bulkMutate('Locked', (o, id) => setActive(o, id, false))}>
            Lock
          </button>
          <span className="custadm-bulk-grp">
            <select
              className="feat-input custadm-bulk-input"
              value={bulkParent}
              onChange={(e) => setBulkParent(e.target.value)}
              aria-label="Move selection to agent"
            >
              <option value="">Move to…</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({ROLE_LABEL[p.role]})
                </option>
              ))}
            </select>
            <button className="feat-btn" onClick={applyBulkMove}>
              Move
            </button>
          </span>
          <button className="feat-btn" onClick={sendBulkReset}>
            Send reset
          </button>
          <button className="custadm-clear" onClick={clearSel}>
            Clear
          </button>
        </div>
      )}

      {done && <p className="feat-ok custadm-flash">{done}</p>}
      {error && <p className="feat-err custadm-flash">{error}</p>}

      {rows.length === 0 ? (
        <p className="feat-empty">No players match this scope and filter.</p>
      ) : (
        <div className="custadm-wrap">
          <table className="custadm">
            <thead>
              <tr>
                <th className="custadm-check">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    aria-label="Select all"
                    onChange={toggleAll}
                  />
                </th>
                <th>Customer</th>
                <th>Agent</th>
                <th className="num">Credit</th>
                <th className="num">Figure</th>
                <th>Login</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <CustomerRow
                  key={m.id}
                  member={m}
                  org={org}
                  parents={parents}
                  signal={bv}
                  credSignal={cv}
                  checked={selected.has(m.id)}
                  onToggle={() => toggleOne(m.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  )
}

function CustomerRow({
  member,
  org,
  parents,
  signal,
  credSignal,
  checked,
  onToggle,
}: {
  member: Member
  org: Org
  parents: Member[]
  signal: number
  credSignal: number
  checked: boolean
  onToggle: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const agent = agentOf(org, member.id)
  const cred = useMemo(() => credentialStatus(member.id), [member.id, credSignal])

  const run = (fn: () => void) => {
    setError(null)
    try {
      mutateBook(fn)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const sendReset = async () => {
    setError(null)
    try {
      await requestPasswordReset(member.id, Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const loginBadge = !cred.hasLogin
    ? { cls: 'is-none', text: 'No login' }
    : cred.resetPendingAt
      ? { cls: 'is-reset', text: 'Reset sent' }
      : { cls: 'is-ok', text: 'Login set' }

  return (
    <>
      <tr className={member.active ? '' : 'is-locked'}>
        <td className="custadm-check">
          <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${member.name}`} />
        </td>
        <td className="custadm-name">{member.name}</td>
        <td>
          <select
            className="custadm-move"
            aria-label={`Agent for ${member.name}`}
            value={agent ? agent.id : org.managerId}
            onChange={(e) => run(() => reassign(org, member.id, e.target.value))}
          >
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({ROLE_LABEL[p.role]})
              </option>
            ))}
          </select>
        </td>
        <td className="num">
          <MoneyCell
            cents={member.account.creditLimit}
            signal={signal}
            onCommit={(c) => run(() => setCreditLimit(org, member.id, c))}
          />
        </td>
        <td className="num">
          <Figure cents={member.account.balance} />
        </td>
        <td className="custadm-login">
          <span className={`custadm-badge ${loginBadge.cls}`}>{loginBadge.text}</span>
          <button
            className="custadm-reset"
            onClick={sendReset}
            disabled={!cred.hasLogin}
            title={cred.email ?? 'No login on file'}
          >
            Send reset
          </button>
        </td>
        <td>
          <button
            className={`custadm-status ${member.active ? 'is-on' : 'is-off'}`}
            onClick={() => run(() => setActive(org, member.id, !member.active))}
          >
            {member.active ? 'Active' : 'Locked'}
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={7} className="custadm-err" role="alert">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}

/** An inline dollar (credit) editor that commits the whole entry on blur/Enter. */
function MoneyCell({
  cents,
  signal,
  onCommit,
}: {
  cents: number
  signal: number
  onCommit: (cents: number) => void
}) {
  const [draft, setDraft] = useState(String(cents / 100))
  useEffect(() => setDraft(String(cents / 100)), [cents, signal])
  const reset = () => setDraft(String(cents / 100))
  const commit = () => {
    const v = Number(draft)
    if (Number.isFinite(v) && v >= 0 && toCents(v) !== cents) onCommit(toCents(v))
    else reset()
  }
  return (
    <span className="custadm-money">
      <span className="custadm-money-cur">$</span>
      <input
        className="custadm-money-input"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') reset()
        }}
        aria-label="Credit limit (dollars)"
      />
    </span>
  )
}
