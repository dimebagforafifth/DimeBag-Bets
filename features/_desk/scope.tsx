import { allAgents, downline, membersByRole, rosterOf, type Member, type Org } from '../org/index.js'
import { getViewer, viewerIsScopedAgent } from '../../app/viewer.js'
import './scope.css'

/**
 * Agent scoping — the shared "view as / filter by agent" control used across the figures,
 * pending, players, risk and cashier panels.
 *
 * Two jobs:
 *  - a MANAGER can drill into any agent's book (or see the whole book);
 *  - an AGENT is CLAMPED to their own downline — every request is collapsed to their
 *    subtree, so an agent can never see another agent's players or the whole book, no
 *    matter what scope a panel passes. This is the data-scope half of role-based access
 *    (the tile-visibility half lives in app/console-access).
 */
export const ALL_SCOPE = 'all'

const ROLE_LABEL: Record<string, string> = { subagent: 'Master', agent: 'Agent' }

/**
 * Clamp a requested scope to the viewer's authority. A manager keeps whatever was asked.
 * A scoped agent can only ever resolve to their own subtree: a request for the whole book
 * (or another agent) collapses to the agent's own id; a request for an agent inside their
 * own downline is allowed (a sub-agent drilling into their agents).
 */
export function effectiveScopeId(org: Org, requestedId: string): string {
  if (!viewerIsScopedAgent()) return requestedId
  const self = getViewer().memberId
  if (requestedId === self) return self
  const inOwnDownline = downline(org, self).some((m) => m.id === requestedId)
  return inOwnDownline ? requestedId : self
}

/** The players in scope: the whole book, or one agent/master agent's roster (subtree).
 *  Clamped to the viewer — an agent only ever gets their own roster. */
export function scopedPlayers(org: Org, scopeId: string): Member[] {
  const id = effectiveScopeId(org, scopeId)
  if (id === ALL_SCOPE) return membersByRole(org, 'player')
  return rosterOf(org, id)
}

/** A predicate for "is this player in the current scope" — for filtering existing lists.
 *  Clamped to the viewer. */
export function inScope(org: Org, scopeId: string): (playerId: string) => boolean {
  const id = effectiveScopeId(org, scopeId)
  if (id === ALL_SCOPE) return () => true
  const ids = new Set(rosterOf(org, id).map((p) => p.id))
  return (playerId: string) => ids.has(playerId)
}

/** Options for the selector. A manager gets Whole book + every agent; a scoped agent gets
 *  only their own book (+ any agents in their own downline they may drill into). */
export function scopeOptions(org: Org): { id: string; label: string }[] {
  if (viewerIsScopedAgent()) {
    const self = getViewer().memberId
    const opts = [{ id: self, label: 'Your book' }]
    for (const m of downline(org, self)) {
      if (m.role === 'agent' || m.role === 'subagent') {
        opts.push({ id: m.id, label: `${m.name} · ${ROLE_LABEL[m.role] ?? m.role}` })
      }
    }
    return opts
  }
  return [
    { id: ALL_SCOPE, label: 'Whole book' },
    ...allAgents(org).map((a) => ({
      id: a.id,
      label: `${a.name} · ${ROLE_LABEL[a.role] ?? a.role}`,
    })),
  ]
}

/** A labelled dropdown that scopes a panel to the whole book or one agent's roster.
 *  For a manager with no agents it hides (nothing to scope). For a scoped agent with no
 *  sub-agents it shows a LOCKED "your book" label (they have no choice). */
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
  const scopedAgent = viewerIsScopedAgent()

  if (scopedAgent && opts.length <= 1) {
    return (
      <div className="scope-bar">
        <span className="scope-bar-label">{label}</span>
        <span className="scope-bar-locked">Your book · your players only</span>
      </div>
    )
  }
  if (opts.length <= 1) return null // manager, no agents → nothing to scope

  // For an agent, show the clamped selection so the dropdown can never read "Whole book".
  const current = scopedAgent ? effectiveScopeId(org, value) : value
  return (
    <label className="scope-bar">
      <span className="scope-bar-label">{label}</span>
      <select
        className="scope-bar-select"
        value={current}
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
