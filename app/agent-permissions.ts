/**
 * Manager-controlled AGENT PERMISSIONS (role-based access).
 *
 * An agent reaches the management console, but only sees the tiles the MANAGER has
 * granted them — and only over their own downline (data scope is enforced separately in
 * features/_desk/scope). This module owns the grant set: which console tiles an agent may
 * be given, a sensible default set for a new agent, and the manager's per-agent overrides.
 *
 * The grant set is keyed by console tile key (see console/registry). We deliberately list
 * the GRANTABLE keys here rather than import the registry, so a manager can never grant an
 * agent a book-wide/manager-only tool (settings, other agents, the trading desk, …) — the
 * grantable set is the allow-list. Persisted on the standard doc seam; the manager edits it
 * from the per-member editor, the App reads it to filter the console.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'

export interface GrantableTile {
  key: string
  label: string
}

/**
 * The console tiles an agent CAN be granted — the scoped player-management + figures
 * tools that make sense over a downline. Anything not here is manager-only and an agent
 * never sees it (other agents, the agent editor, cashier desk policy, lines/trading,
 * settings, access, branding, scores, etc.). Labels are kept here (not imported from the
 * registry) so the per-member editor doesn't pull the registry into a cycle.
 */
export const AGENT_GRANTABLE: readonly GrantableTile[] = [
  { key: 'players', label: 'Player Admin' },
  { key: 'customer-admin', label: 'Customer Admin' },
  { key: 'add-player', label: 'Add Customer' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'limits', label: 'Limits' },
  { key: 'performance', label: 'Player Performance' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'notes', label: 'Notes & Tags' },
  { key: 'pending', label: 'Pending Bets' },
  { key: 'weekly-figures', label: 'Weekly Figures' },
  { key: 'figures', label: 'Weekly Sheet' },
  { key: 'collections', label: 'Collections' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'agent-performance', label: 'Agent Performance' },
  // A capability, not a console section: lets an agent comp/reward THEIR OWN players
  // (within the manager's allowance). Gates the Player Rewards (comp) tile + the action.
  { key: 'rewards-comp', label: 'Issue player rewards (comp)' },
]

export const AGENT_GRANTABLE_KEYS: readonly string[] = AGENT_GRANTABLE.map((t) => t.key)

/** What a brand-new agent gets until the manager tunes it. */
export const DEFAULT_AGENT_KEYS: readonly string[] = [
  'players',
  'customer-admin',
  'add-player',
  'cashier',
  'limits',
  'pending',
  'weekly-figures',
  'collections',
]

const store = createStore({ namespace: 'dimebag' })
// memberId -> the granted tile keys (an explicit override of the default set).
const DOC: Doc<Record<string, string[]>> = persistedDoc<Record<string, string[]>>(
  store,
  'agent.permissions',
  { version: 1, initial: {} },
)

let perms: Record<string, string[]> = DOC.load() ?? {}
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  DOC.save(perms)
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeAgentPermissions(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getAgentPermissionsVersion(): number {
  return version
}

/**
 * The granted tile keys for an agent. An agent with no stored override gets
 * DEFAULT_AGENT_KEYS; either way the result is clamped to the grantable allow-list so a
 * stale/forged key can never widen access. Returns a fresh Set.
 */
export function grantedTiles(agentId: string): Set<string> {
  const stored = perms[agentId]
  const base = stored ?? DEFAULT_AGENT_KEYS
  return new Set(base.filter((k) => AGENT_GRANTABLE_KEYS.includes(k)))
}

/** Whether an agent is granted a specific tile. */
export function isTileGranted(agentId: string, tileKey: string): boolean {
  return grantedTiles(agentId).has(tileKey)
}

/** Grant or revoke one tile for an agent (no-op if the key isn't grantable). */
export function setAgentTile(agentId: string, tileKey: string, granted: boolean): void {
  if (!AGENT_GRANTABLE_KEYS.includes(tileKey)) return
  const current = grantedTiles(agentId)
  if (granted) current.add(tileKey)
  else current.delete(tileKey)
  perms = { ...perms, [agentId]: [...current] }
  notify()
}

/** Reset an agent back to the default grant set. */
export function resetAgentPermissions(agentId: string): void {
  perms = { ...perms }
  delete perms[agentId]
  notify()
}

/** Test helper: clear every override. */
export function __resetAllAgentPermissions(): void {
  perms = {}
  notify()
}
