import { useMemo, useState, useSyncExternalStore } from 'react'
import { membersByRole, type Member, type Role } from '../../org/index.js'
import { getBook, getBookVersion, subscribeBook } from '../book-store.js'
import {
  CAPABILITY_LABEL,
  MANAGER_ONLY,
  effectiveCaps,
  isRoleDefault,
  roleCeiling,
  type Capability,
} from './permissions.js'
import {
  clearGrant,
  getGrants,
  getPermissionsVersion,
  setGrant,
  subscribePermissions,
} from './permissions-store.js'

const ROLE_LABEL: Record<Role, string> = {
  manager: 'Manager',
  subagent: 'Sub-agent',
  agent: 'Agent',
  player: 'Player',
}

/**
 * Permissions — the head manager grants controlled slices of the console to their
 * sub-agents and agents (CLAUDE.md §4, §5). It edits a per-member allow-list in the
 * permissions store; the role ceiling means the admin-only tools (Permissions, Setup)
 * can never be delegated, so this screen can't be used to escalate anyone. Manager-only
 * tool; the console gates reachability to managers.
 */
export function PermissionsPanel() {
  const bookV = useSyncExternalStore(subscribeBook, getBookVersion)
  const permV = useSyncExternalStore(subscribePermissions, getPermissionsVersion)

  const operators = useMemo(() => {
    const org = getBook()
    // Staff who can reach the console (players never do). Sub-agents above agents.
    return [...membersByRole(org, 'subagent'), ...membersByRole(org, 'agent')]
    // bookV is the change signal.
  }, [bookV])

  const grants = useMemo(() => getGrants(), [permV])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = operators.find((o) => o.id === selectedId) ?? operators[0] ?? null

  return (
    <div className="con-perm">
      <header className="con-perm-head">
        <h1 className="con-h1">Permissions</h1>
        <p className="con-sub">
          Grant each operator only the tools they need. You always keep full access.
        </p>
      </header>

      {operators.length === 0 ? (
        <p className="con-empty">
          No sub-agents or agents yet. Recruit staff under Players &amp; agents first.
        </p>
      ) : (
        <div className="con-perm-grid">
          <ul className="con-perm-people" role="tablist" aria-label="Operators">
            {operators.map((o) => (
              <li key={o.id}>
                <button
                  role="tab"
                  aria-selected={o.id === selected?.id}
                  className={`con-perm-person ${o.id === selected?.id ? 'is-on' : ''}`}
                  onClick={() => setSelectedId(o.id)}
                >
                  <span className="con-perm-person-name">{o.name}</span>
                  <span className="con-perm-person-meta">
                    {ROLE_LABEL[o.role]} · {isRoleDefault(o.id, grants) ? 'role default' : 'custom'}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected && <OperatorEditor key={selected.id} member={selected} grants={grants} />}
        </div>
      )}
    </div>
  )
}

function OperatorEditor({
  member,
  grants,
}: {
  member: Member
  grants: Record<string, Capability[]>
}) {
  const ceiling = roleCeiling(member.role)
  const current = new Set(effectiveCaps(member, grants))
  const onDefault = isRoleDefault(member.id, grants)

  const toggle = (cap: Capability) => {
    const next = new Set(current)
    if (next.has(cap)) next.delete(cap)
    else next.add(cap)
    // Persist the explicit allow-list (the store + model clamp to the ceiling).
    setGrant(
      member.id,
      ceiling.filter((c) => next.has(c)),
    )
  }

  return (
    <section className="con-perm-editor" aria-label={`Permissions for ${member.name}`}>
      <div className="con-perm-editor-head">
        <h2 className="con-h2">
          {member.name} <span className="con-tag">{ROLE_LABEL[member.role]}</span>
        </h2>
        <button
          className="con-btn con-btn-sm"
          disabled={onDefault}
          onClick={() => clearGrant(member.id)}
        >
          {onDefault ? 'On role default' : 'Reset to role default'}
        </button>
      </div>

      <div className="con-perm-caps">
        {ceiling.map((cap) => (
          <label key={cap} className={`con-perm-cap ${current.has(cap) ? 'is-on' : ''}`}>
            <input type="checkbox" checked={current.has(cap)} onChange={() => toggle(cap)} />
            <span>{CAPABILITY_LABEL[cap]}</span>
          </label>
        ))}
      </div>

      <p className="con-hint">
        Admin-only tools ({MANAGER_ONLY.map((c) => CAPABILITY_LABEL[c]).join(', ')}) stay with
        managers and can&apos;t be delegated.
      </p>
    </section>
  )
}
