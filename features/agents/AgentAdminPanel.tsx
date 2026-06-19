import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  allAgents,
  availableCredit,
  agentPerformance,
  setActive,
  setCommissionPct,
  setCreditLimit,
  type Member,
} from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import { formatMoney, toCents } from '../../games/shared/money.js'
import { PanelShell } from '../_desk/shared.js'
import { useIsBalanceMode } from '../../app/economy-mode.js'
import './agents.css'

const ROLE_LABEL: Record<string, string> = { subagent: 'Master', agent: 'Agent' }

/**
 * Agent Admin — the roster of agents + master agents on the book. For each: set their
 * ALLOWANCE (the credit budget they can hand down to their own players — enforced by the
 * org credit-waterfall against the parent's headroom), set a COMMISSION split, and
 * suspend/activate them. New agents are onboarded from Add Customer. Dollars only; edits
 * route through the org mutators via mutateBook (persisted + audited downstream).
 */
export function AgentAdminPanel({ onBack }: { onBack: () => void }) {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  // Balance (wallet) mode has no credit waterfall: an agent hands down no credit budget, so the
  // allowance + to-grant columns drop and the copy speaks only to commission (CLAUDE.md §3).
  const balanceMode = useIsBalanceMode()
  const [q, setQ] = useState('')

  const agents = useMemo(() => {
    const all = allAgents(getBook())
    const term = q.trim().toLowerCase()
    return term ? all.filter((a) => a.name.toLowerCase().startsWith(term)) : all
    // bv is the change signal
  }, [q, bv])

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          {balanceMode ? (
            <>
              Your agents and master agents. Set each one&rsquo;s <strong>commission</strong> split,
              or suspend them. Onboard a new agent from <strong>Add Customer</strong>.
            </>
          ) : (
            <>
              Your agents and master agents. Set each one&rsquo;s <strong>allowance</strong> (the
              credit budget they distribute to their roster) and <strong>commission</strong> split,
              or suspend them. Onboard a new agent from <strong>Add Customer</strong>.
            </>
          )}
        </p>
      </header>

      <input
        className="feat-input agt-search"
        placeholder="Search agents…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {agents.length === 0 ? (
        <p className="feat-empty">No agents yet — onboard one from Add Customer.</p>
      ) : (
        <div className="agtbl-wrap">
          <table className="agtbl">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Type</th>
                <th className="num">Roster</th>
                {!balanceMode && <th className="num">Allowance</th>}
                {!balanceMode && <th className="num">To grant</th>}
                <th className="num">Commission</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <AgentRow key={a.id} member={a} signal={bv} balanceMode={balanceMode} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  )
}

function AgentRow({
  member,
  signal,
  balanceMode,
}: {
  member: Member
  signal: number
  balanceMode: boolean
}) {
  const org = getBook()
  const perf = agentPerformance(org, member.id)
  const toGrant = availableCredit(org, member.id)
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => void) => {
    setError(null)
    try {
      mutateBook(fn)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <tr className={member.active ? '' : 'is-suspended'}>
        <td className="agtbl-name">{member.name}</td>
        <td>
          <span className={`agt-badge is-${member.role}`}>{ROLE_LABEL[member.role]}</span>
        </td>
        <td className="num">{perf.roster}</td>
        {!balanceMode && (
          <td className="num">
            <CoinCell
              cents={member.account.creditLimit}
              signal={signal}
              onCommit={(c) => run(() => setCreditLimit(org, member.id, c))}
            />
          </td>
        )}
        {!balanceMode && (
          <td className={`num ${toGrant < 0 ? 'is-down' : ''}`}>{formatMoney(toGrant)}</td>
        )}
        <td className="num">
          <PctCell
            pct={member.commissionPct ?? 0}
            signal={signal}
            onCommit={(p) => run(() => setCommissionPct(org, member.id, p))}
          />
        </td>
        <td>
          <button
            className={`agtbl-btn ${member.active ? '' : 'is-off'}`}
            onClick={() => run(() => setActive(org, member.id, !member.active))}
          >
            {member.active ? 'Active' : 'Suspended'}
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={balanceMode ? 5 : 7} className="agtbl-err" role="alert">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}

/** An inline dollar (credit) editor that commits the whole entry on blur/Enter. */
function CoinCell({
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
  const commit = () => {
    const v = Number(draft)
    if (Number.isFinite(v) && v >= 0) onCommit(toCents(v))
    else setDraft(String(cents / 100))
  }
  return (
    <input
      className="agtbl-input"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setDraft(String(cents / 100))
      }}
    />
  )
}

/** An inline percent editor (0–100, blank/0 clears) committing on blur/Enter. */
function PctCell({
  pct,
  signal,
  onCommit,
}: {
  pct: number
  signal: number
  onCommit: (pct: number | null) => void
}) {
  const [draft, setDraft] = useState(pct ? String(pct) : '')
  useEffect(() => setDraft(pct ? String(pct) : ''), [pct, signal])
  const commit = () => {
    const t = draft.trim()
    if (t === '') return onCommit(null)
    const v = Number(t)
    if (Number.isFinite(v) && v >= 0 && v <= 100) onCommit(v)
    else setDraft(pct ? String(pct) : '')
  }
  return (
    <span className="agtbl-pct">
      <input
        className="agtbl-input"
        inputMode="decimal"
        placeholder="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(pct ? String(pct) : '')
        }}
      />
      %
    </span>
  )
}
