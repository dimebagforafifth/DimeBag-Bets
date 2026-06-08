/**
 * Boot shim: activate the tenant (book) from the signed-in session BEFORE any
 * tenant-scoped store initialises (CLAUDE.md §5). The book/settings/vip/… stores are
 * module singletons created at import, so the active tenant must be known FIRST — the
 * tenancy author flagged this ordering. main.tsx therefore imports this module BEFORE
 * `App` (which pulls in book-store).
 *
 * We read the persisted session straight from persistence — NOT through `auth/`, which
 * imports book-store and would defeat the ordering. Auth is GLOBAL (one identity store,
 * not per-book), so it lives at the default namespace, the same place demoAdapter writes
 * it. No session / no tenantId → the DEFAULT tenant = today's exact behaviour (the demo
 * session carries no tenantId, so the demo book is unchanged).
 *
 * // TODO(api): under real Supabase auth the session's tenantId comes from the operator's
 * org claim; switching books in a running tab still needs a reload (singletons are fixed
 * at import) — a documented limitation, not breakage.
 */

import { createLocalStore, persistedDoc, setActiveTenant } from '../persistence/index.js'
import type { Session } from '../auth/types.js'

/** Read the persisted session and set the active tenant from its `tenantId` (or default). */
export function activateTenantFromBoot(): void {
  // Auth lives at the default namespace (tenant-independent); read it before any tenant is set.
  const authStore = createLocalStore({ namespace: 'dimebag' })
  const session = persistedDoc<Session | null>(authStore, 'auth.session', {
    version: 1,
    initial: null,
  }).load()
  setActiveTenant(session?.user?.tenantId)
}

// The boot side-effect: runs once, before App/book-store are imported.
activateTenantFromBoot()
