/**
 * The persisted console-permissions store — the per-member capability grants the head
 * manager configures. Same blueprint as app/settings-store.ts / app/edge-store.ts: a
 * framework-agnostic external store (subscribe / version snapshot) mirrored into React
 * with `useSyncExternalStore`, persisted via `persistedDoc` under namespace 'dimebag'.
 *
 * It stores ONLY overrides: a member with no entry falls back to their role default
 * (see permissions.ts). Clearing a grant deletes the entry → back to the default. It
 * moves no money and holds no roles — roles stay in org/ (read-only here).
 *
 * // TODO(api): when Agent 1's Supabase data layer is live, these grants belong on the
 * server (per-book row) so they apply across devices and can't be edited client-side.
 * The persistedDoc seam already abstracts the backing store; swap the KV for the
 * Supabase-backed Doc and this API is unchanged.
 */

import { createLocalStore, persistedDoc, type Doc } from '../../persistence/index.js'
import { ALL_CAPABILITIES, type Capability, type PermissionGrants } from './permissions.js'

const store = createLocalStore({ namespace: 'dimebag' })
const DOC: Doc<PermissionGrants> = persistedDoc<PermissionGrants>(store, 'console.permissions', {
  version: 1,
  initial: {},
})

const CAP_SET = new Set(ALL_CAPABILITIES)
let grants: PermissionGrants = sanitize(DOC.load())
const listeners = new Set<() => void>()
let version = 0

/** Drop any unknown capability strings a stale payload might carry. */
function sanitize(raw: PermissionGrants): PermissionGrants {
  const out: PermissionGrants = {}
  for (const [id, caps] of Object.entries(raw ?? {})) {
    if (Array.isArray(caps))
      out[id] = caps.filter((c): c is Capability => CAP_SET.has(c as Capability))
  }
  return out
}

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

function persist(): void {
  DOC.save(grants)
  notify()
}

/* -------------------------------- the API ------------------------------- */

export function subscribePermissions(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getPermissionsVersion(): number {
  return version
}

/** The live grant map (stable reference between changes). */
export function getGrants(): PermissionGrants {
  return grants
}

/** A member's custom grant, or null if they're on their role default. */
export function getGrant(memberId: string): Capability[] | null {
  return grants[memberId] ?? null
}

/** Save a custom allow-list for a member (replaces their role default). Unknown caps
 *  are dropped; the list is stored as given (the role ceiling is applied at read time
 *  in effectiveCaps, so escalation is impossible even if a bad list is saved). */
export function setGrant(memberId: string, caps: Capability[]): void {
  grants = { ...grants, [memberId]: caps.filter((c) => CAP_SET.has(c)) }
  persist()
}

/** Remove a member's custom grant → they revert to their role default. */
export function clearGrant(memberId: string): void {
  if (!(memberId in grants)) return
  const next = { ...grants }
  delete next[memberId]
  grants = next
  persist()
}

/** Test/SSR helper: wipe all overrides (does not persist a notify storm in prod use). */
export function __resetPermissions(): void {
  grants = {}
  DOC.save(grants)
  notify()
}
