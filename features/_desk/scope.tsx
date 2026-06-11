import { allAgents, membersByRole, rosterOf, type Member, type Org } from '../../org/index.js'
import './scope.css'

/**
 * Agent scoping — the shared "view as / filter by agent" control used across the figures,
 * pending, players, risk and cashier panels so a manager can drill into one agent's book
 * (a master agent sees their agents' rosters; an agent sees only their players). The
 * scope is an agent/master member id, or ALL_SCOPE for the whole book.
 */
export const ALL_SCOPE = 'all'

const ROLE_LABEL: Record<string, string> = { subagent: 'Master', agent: 'Agent' }

/** The players in scope: the whole book, or one agent/master agent's roster (subtree). */
export function scopedPlayers(org: Org, scopeId: string): Member[] {
  if (scopeId === ALL_SCOPE) return membersByRole(org, 'player')
  return rosterOf(org, scopeId)
}

/** A predicate for "is this player in the current scope" — for filtering existing lists. */
export function inScope(org: Org, scopeId: string): (playerId: string) => boolean {
  if (scopeId === ALL_SCOPE) return () => true
  const ids = new Set(rosterOf(org, scopeId).map((p) => p.id))
  return (playerId: string) => ids.has(playerId)
}

/** Options for the selector: Whole book + every agent (master agents first), labelled. */
export function scopeOptions(org: Org): { id: string; label: string }[] {
  return [
    { id: ALL_SCOPE, label: 'Whole book' },
    ...allAgents(org).map((a) => ({
      id: a.id,
      label: `${a.name} · ${ROLE_LABEL[a.role] ?? a.role}`,
    })),
  ]
}

/** A labelled dropdown that scopes a panel to the whole book or one agent's roster.
 *  Hidden when the book has no agents (nothing to scope by). */
export function ScopeBar({
  org,
  value,
  onChange,
  label = 'Scope',
}: {
  org: Org
  value: string
  onChange: (id: string) => void
  label?: string
}) {
  const opts = scopeOptions(org)
  if (opts.length <= 1) return null // no agents → nothing to scope
  return (
    <label className="scope-bar">
      <span className="scope-bar-label">{label}</span>
      <select
        className="scope-bar-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
