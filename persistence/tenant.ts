/**
 * Tenant context (CLAUDE.md §5, §6 — multi-tenant books).
 *
 * Each manager is a fully isolated BOOK: their org, settings, branding, VIP, audit,
 * ledger — none of it may ever leak into another operator's book. This module is the
 * one place that knows WHICH tenant is active, and it scopes every storage namespace
 * to it. Because the storage seam keys as `<namespace>:<key>`, suffixing the namespace
 * per tenant gives each book its own keyspace (localStorage today, a `tenant_id` column
 * + RLS under Supabase tomorrow — see supabase/migrations/0004_tenancy.sql).
 *
 * THE DEFAULT TENANT preserves today's behaviour exactly: its namespace is returned
 * UNCHANGED (`'dimebag'`), so the single demo book and every existing key/test are
 * byte-for-byte identical until a real tenant is set. Multi-tenancy is opt-in: the
 * app sets the active tenant from the signed-in operator's identity at boot.
 *
 * The active tenant is read at store-CREATION time. Stores are module singletons, so
 * the active tenant must be set before they initialise (a boot step); switching tenant
 * in a running tab means re-initialising (a reload). This keeps the model simple and
 * correct: one active book per app instance, each book's bytes fully separate.
 */

/** The sentinel for the original single book — its namespace is never suffixed. */
export const DEFAULT_TENANT = 'default'

let active = DEFAULT_TENANT
const listeners = new Set<() => void>()

/** The active tenant id (the default sentinel when none has been set). */
export function getActiveTenant(): string {
  return active
}

/** Whether a real (non-default) tenant is active. */
export function hasTenant(): boolean {
  return active !== DEFAULT_TENANT
}

/**
 * Set the active tenant (e.g. from the signed-in operator). A null/empty id resets to
 * the default book. Notifies subscribers; does nothing if unchanged. Call this at boot
 * BEFORE the stores initialise — see the module note about singletons.
 */
export function setActiveTenant(id: string | null | undefined): void {
  const next = id && id.length > 0 ? id : DEFAULT_TENANT
  if (next === active) return
  active = next
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* a subscriber must never break tenant switching */
    }
  }
}

/** Subscribe to tenant changes. Returns an unsubscribe fn. */
export function subscribeTenant(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Sanitise a tenant id into a namespace-safe token (keeps the `<ns>:<key>` scheme clean). */
function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Resolve a base namespace to the active tenant's namespace. The default tenant returns
 * the base UNCHANGED (so `'dimebag'` stays `'dimebag'`); a real tenant gets a distinct
 * suffix (`'dimebag~t~acme'`) that cannot prefix-collide with the default or any other
 * tenant. This is the single seam every store passes through.
 */
export function tenantNamespace(base: string): string {
  return active === DEFAULT_TENANT ? base : `${base}~t~${safe(active)}`
}

/** Test helper: restore the default tenant. */
export function __resetTenant(): void {
  active = DEFAULT_TENANT
}
