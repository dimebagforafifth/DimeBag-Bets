/**
 * Agents — the book's hierarchy on one screen: the manager at the root, then
 * super-agents (sub-agents), agents, and players nested underneath. Pick anyone in
 * the tree to edit their credit limit, balance, and limits.
 *
 * Money discipline: a balance move goes through the audited `adjustFigure` (core +
 * ledger + audit); credit/active/max-bet/lock changes go through the org setters
 * inside `mutateBook` (which persists + notifies and enforces the tree's credit
 * rules). No field writes an account directly. Coins (integer cents) only.
 */
import { useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react'
import {
  directReports,
  bookFigure,
  availableCredit,
  playerCount,
  setCreditLimit,
  setActive,
  setMaxWager,
  setBettingLocked,
  addMember,
  eligibleParents,
  type Member,
  type Org,
  type Role,
} from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook, mutateBook } from '../../app/book-store.js'
import { adjustFigure } from '../../app/manager-actions.js'
import {
  AGENT_GRANTABLE,
  grantedTiles,
  setAgentTile,
  resetAgentPermissions,
  subscribeAgentPermissions,
  getAgentPermissionsVersion,
} from '../../app/agent-permissions.js'
import { formatMoney, toCents, toSignedCents } from '../../games/shared/money.js'
import { PanelShell, Figure } from '../_desk/shared.js'
import { InfoDot } from '../_desk/Tooltip.js'
import './agents.css'

const ROLE_LABEL: Record<Role, string> = {
  manager: 'Manager',
  subagent: 'Super-Agent',
  agent: 'Agent',
  player: 'Player',
}

export interface TreeNode {
  member: Member
  depth: number
  children: TreeNode[]
}

/** Build the org tree from the manager root, children sorted by name. Pure. */
export function buildForest(org: Org): TreeNode {
  const make = (id: string, depth: number): TreeNode => ({
    member: org.members[id],
    depth,
    children: directReports(org, id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => make(c.id, depth + 1)),
  })
  return make(org.managerId, 0)
}

/** Flatten the tree to visible rows, skipping the children of collapsed nodes. */
export function flatten(node: TreeNode, collapsed: ReadonlySet<string>, out: TreeNode[] = []): TreeNode[] {
  out.push(node)
  if (!collapsed.has(node.member.id)) {
    for (const c of node.children) flatten(c, collapsed, out)
  }
  return out
}

/** Add a player / agent / super-agent under an eligible parent. The role drives the
 *  parent list via org.eligibleParents (super-agent → manager; agent → manager or a
 *  super-agent; player → manager, super-agent, or agent), and addMember enforces the
 *  tier + credit-headroom rules. */
function AddMember({ org }: { org: Org }) {
  const [role, setRole] = useState<Exclude<Role, 'manager'>>('player')
  const [parentId, setParentId] = useState('')
  const [name, setName] = useState('')
  const [credit, setCredit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const parents = eligibleParents(org, role)
  const parent = parents.some((p) => p.id === parentId) ? parentId : (parents[0]?.id ?? '')

  const add = () => {
    setError(null)
    setSaved(null)
    if (!name.trim() || !parent) return
    try {
      mutateBook(() =>
        addMember(getBook(), role, parent, {
          name: name.trim(),
          creditLimit: toCents(Number(credit) || 0),
        }),
      )
      setSaved(`Added ${ROLE_LABEL[role].toLowerCase()} “${name.trim()}”.`)
      setName('')
      setCredit('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="feat-card agt-add" aria-label="Add member">
      <h3 className="feat-h2">Add member</h3>
      <div className="agt-add-grid">
        <label className="feat-field">
          <span className="feat-label">Role</span>
          <select
            className="feat-input"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as Exclude<Role, 'manager'>)
              setParentId('')
            }}
          >
            <option value="subagent">Super-Agent</option>
            <option value="agent">Agent</option>
            <option value="player">Player</option>
          </select>
        </label>
        <label className="feat-field">
          <span className="feat-label">Under</span>
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
        <label className="feat-field">
          <span className="feat-label">Name</span>
          <input
            className="feat-input"
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="feat-field">
          <span className="feat-label">Credit limit (dollars)</span>
          <input
            className="feat-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="feat-btn feat-btn-primary agt-add-btn"
          disabled={!name.trim() || !parent}
          onClick={add}
        >
          Add {ROLE_LABEL[role]}
        </button>
      </div>
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

export function AgentsPanel({ onBack }: { onBack: () => void }) {
  const bv = useSyncExternalStore(subscribeBook, getBookVersion)
  const book = getBook()
  const root = useMemo(() => buildForest(book), [bv])

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState<string>(book.managerId)

  const rows = useMemo(() => flatten(root, collapsed), [root, collapsed])
  const selected = book.members[selectedId] ?? book.members[book.managerId]

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <PanelShell onBack={onBack}>
      <header className="feat-head">
        <p className="feat-sub">
          Your book’s hierarchy — super-agents, agents and players. Select anyone to edit their
          credit, balance and limits.
        </p>
      </header>

      <AddMember org={book} />

      <div className="agt-layout">
        <div className="agt-tree feat-card" role="tree" aria-label="Agent hierarchy">
          {rows.map((n) => {
            const m = n.member
            const hasKids = n.children.length > 0
            return (
              <div
                key={m.id}
                className={`agt-row ${m.id === selectedId ? 'is-sel' : ''}`}
                style={{ ['--depth' as string]: n.depth } as CSSProperties}
              >
                {hasKids ? (
                  <button
                    type="button"
                    className="agt-caret"
                    aria-label={collapsed.has(m.id) ? `Expand ${m.name}` : `Collapse ${m.name}`}
                    onClick={() => toggle(m.id)}
                  >
                    {collapsed.has(m.id) ? '▸' : '▾'}
                  </button>
                ) : (
                  <span className="agt-caret-spacer" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="agt-rowbtn"
                  aria-pressed={m.id === selectedId}
                  onClick={() => setSelectedId(m.id)}
                >
                  <span className={`agt-badge is-${m.role}`}>{ROLE_LABEL[m.role]}</span>
                  <span className="agt-name">
                    {m.name}
                    {!m.active && <span className="agt-tag">inactive</span>}
                    {m.account.bettingLocked && <span className="agt-tag is-lock">locked</span>}
                  </span>
                  <span className="agt-fig">
                    <Figure cents={m.account.balance} />
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        <MemberEditor key={selected.id} member={selected} org={book} />
      </div>
    </PanelShell>
  )
}

function MemberEditor({ member, org }: { member: Member; org: Org }) {
  const isPlayer = member.role === 'player'
  const isManager = member.role === 'manager'
  const isAgent = member.role === 'agent' || member.role === 'subagent'

  const [credit, setCredit] = useState(String(member.account.creditLimit / 100))
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [maxw, setMaxw] = useState(member.account.maxWager ? String(member.account.maxWager / 100) : '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

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

  const saveCredit = () =>
    guard(
      () => mutateBook(() => setCreditLimit(getBook(), member.id, toCents(Number(credit) || 0))),
      'Credit limit updated.',
    )

  const applyAdjust = () => {
    const delta = toSignedCents(Number(amount) || 0)
    if (delta === 0 || reason.trim() === '') return
    guard(() => adjustFigure(member.id, delta, reason.trim(), 'operator'), 'Balance adjusted.')
    setAmount('')
    setReason('')
  }

  const toggleActive = () =>
    guard(
      () => mutateBook(() => setActive(getBook(), member.id, !member.active)),
      member.active ? 'Deactivated.' : 'Activated.',
    )

  const saveMaxw = () =>
    guard(
      () =>
        mutateBook(() =>
          setMaxWager(getBook(), member.id, maxw.trim() === '' ? null : toCents(Number(maxw) || 0)),
        ),
      'Max bet updated.',
    )

  const toggleLock = () =>
    guard(
      () => mutateBook(() => setBettingLocked(getBook(), member.id, !member.account.bettingLocked)),
      member.account.bettingLocked ? 'Betting unlocked.' : 'Betting locked.',
    )

  return (
    <div className="agt-detail feat-card">
      <div className="feat-head">
        <h3 className="feat-h2">{member.name}</h3>
        <span className={`agt-badge is-${member.role}`}>{ROLE_LABEL[member.role]}</span>
      </div>

      <section className="feat-kpis" aria-label="Standing">
        <div className="feat-kpi">
          <span className="feat-label">
            Balance <InfoDot id="figure" />
          </span>
          <strong className={member.account.balance < 0 ? 'feat-down' : 'feat-up'}>
            <Figure cents={member.account.balance} />
          </strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">
            Exposure <InfoDot id="exposure" />
          </span>
          <strong>{formatMoney(member.account.pending)}</strong>
        </div>
        <div className="feat-kpi">
          <span className="feat-label">
            Credit limit <InfoDot id="credit-limit" />
          </span>
          <strong>{formatMoney(member.account.creditLimit)}</strong>
        </div>
        {!isPlayer && (
          <>
            <div className="feat-kpi">
              <span className="feat-label">Downline net</span>
              <strong>{formatMoney(bookFigure(org, member.id))}</strong>
            </div>
            <div className="feat-kpi">
              <span className="feat-label">Players under</span>
              <strong>{playerCount(org, member.id)}</strong>
            </div>
            <div className="feat-kpi">
              <span className="feat-label">Credit to grant</span>
              <strong>{formatMoney(availableCredit(org, member.id))}</strong>
            </div>
          </>
        )}
      </section>

      {/* Adjust balance — audited through core */}
      <div className="agt-edit">
        <span className="feat-label">Adjust balance (dollars)</span>
        <div className="feat-actions">
          <input
            className="feat-input"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="+ / − amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className="feat-input"
            type="text"
            placeholder="Reason (logged)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            className="feat-btn"
            disabled={!(Number(amount) && reason.trim())}
            onClick={applyAdjust}
          >
            Apply
          </button>
        </div>
      </div>

      {/* Credit limit */}
      <div className="agt-edit">
        <span className="feat-label">Credit limit (dollars)</span>
        <div className="feat-actions">
          <input
            className="feat-input"
            type="number"
            step="0.01"
            min="0"
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
          />
          <button type="button" className="feat-btn" onClick={saveCredit}>
            Save
          </button>
        </div>
      </div>

      {/* Player-only levers */}
      {isPlayer && (
        <>
          <div className="agt-edit">
            <span className="feat-label">Max bet (dollars — blank clears the cap)</span>
            <div className="feat-actions">
              <input
                className="feat-input"
                type="number"
                step="0.01"
                min="0"
                placeholder="none"
                value={maxw}
                onChange={(e) => setMaxw(e.target.value)}
              />
              <button type="button" className="feat-btn" onClick={saveMaxw}>
                Save
              </button>
            </div>
          </div>
          <label className="feat-check">
            <input
              type="checkbox"
              checked={!!member.account.bettingLocked}
              onChange={toggleLock}
            />
            Betting locked
          </label>
        </>
      )}

      {/* Active toggle (everyone but the book root) */}
      {!isManager && (
        <label className="feat-check">
          <input type="checkbox" checked={member.active} onChange={toggleActive} />
          Active
        </label>
      )}

      {/* Console access — which management tools this agent gets (manager-controlled) */}
      {isAgent && <AgentAccess agentId={member.id} />}

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
    </div>
  )
}

/**
 * Console access for an agent — the manager picks which management tiles this agent gets.
 * The agent sees ONLY the granted tiles (app/console-access) and every tool is data-scoped
 * to their own downline (features/_desk/scope). Writes persist immediately.
 */
function AgentAccess({ agentId }: { agentId: string }) {
  useSyncExternalStore(subscribeAgentPermissions, getAgentPermissionsVersion)
  const granted = grantedTiles(agentId)
  return (
    <section className="agt-access" aria-label="Console access">
      <div className="agt-access-head">
        <span className="feat-label">
          Console access <InfoDot id="figure" />
        </span>
        <button
          type="button"
          className="feat-btn agt-access-reset"
          onClick={() => resetAgentPermissions(agentId)}
        >
          Reset to default
        </button>
      </div>
      <p className="feat-sub agt-access-note">
        The agent only sees the tiles you grant here, and every tool is limited to their own
        downline — they never see other agents or the whole book.
      </p>
      <div className="agt-access-grid">
        {AGENT_GRANTABLE.map((t) => (
          <label key={t.key} className="feat-check agt-access-item">
            <input
              type="checkbox"
              checked={granted.has(t.key)}
              onChange={(e) => setAgentTile(agentId, t.key, e.target.checked)}
            />
            {t.label}
          </label>
        ))}
      </div>
    </section>
  )
}
