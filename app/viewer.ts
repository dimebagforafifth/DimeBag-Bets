/**
 * The current OPERATOR viewer (role-based access).
 *
 * Who is looking at the management console — their book member id + role. The App sets
 * it from the signed-in identity; the scope kit (features/_desk/scope) reads it to clamp
 * an agent's data scope to their own downline so an agent can never see another agent's
 * players or the whole book, regardless of what a panel requests. A manager viewer is
 * unclamped (sees everything). Defaults to the demo operator so component tests and the
 * console render exactly as before for a manager.
 */

import type { Role } from '../org/index.js'

export interface Viewer {
  memberId: string
  role: Role
}

let viewer: Viewer = { memberId: 'mgr', role: 'manager' }
let version = 0
const listeners = new Set<() => void>()

export function setViewer(memberId: string, role: Role): void {
  if (viewer.memberId === memberId && viewer.role === role) return
  viewer = { memberId, role }
  version += 1
  listeners.forEach((l) => l())
}

export function getViewer(): Viewer {
  return viewer
}

export function subscribeViewer(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function getViewerVersion(): number {
  return version
}

/** True when the viewer is a scoped operator (agent or sub-agent) — their view is
 *  clamped to their downline. A manager returns false (unclamped). */
export function viewerIsScopedAgent(): boolean {
  return viewer.role === 'agent' || viewer.role === 'subagent'
}
