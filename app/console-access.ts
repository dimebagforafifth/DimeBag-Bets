/**
 * Role → which console tiles are visible (role-based access).
 *
 * The single gate the App uses to hand the Console its registry:
 *  - MANAGER  → the whole registry (everything),
 *  - AGENT / SUB-AGENT → only the tiles the manager granted them (agent-permissions),
 *  - PLAYER   → nothing (a player never reaches the console; auth/roles blocks the
 *               section, this is the belt-and-braces guard).
 *
 * Data scope (an agent seeing only their downline) is enforced separately in
 * features/_desk/scope via the viewer; this controls only which TOOLS appear.
 */

import type { Role } from '../org/index.js'
import type { FeatureManifest } from '../console/registry/types.js'
import { grantedTiles } from './agent-permissions.js'

export function registryForRole(
  registry: FeatureManifest[],
  role: Role,
  memberId: string | null,
): FeatureManifest[] {
  if (role === 'manager') return registry
  if (role === 'player' || !memberId) return []
  const granted = grantedTiles(memberId)
  return registry.filter((m) => granted.has(m.key))
}
