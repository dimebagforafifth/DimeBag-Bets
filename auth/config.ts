/**
 * Which auth backend is live. We reuse the persistence module's single env seam
 * (`isSupabaseConfigured`, which reads SUPABASE_URL / VITE_SUPABASE_URL + the anon
 * key) so auth and the data layer agree on "are we configured" and nobody forks the
 * env reading.
 */

import { isSupabaseConfigured, type EnvSource } from '../persistence/index.js'

/**
 * The Supabase Auth adapter is implemented (auth/supabaseAdapter.ts) and
 * `@supabase/supabase-js` is a dependency, so this is `true`. It only takes effect when
 * keys are ALSO present (see `supabaseAuthReady`): with no keys the demo adapter still
 * runs and the app behaves byte-for-byte as before — the "fall back to current behaviour
 * until keys are provided" invariant.
 */
export const SUPABASE_AUTH_WIRED = true

/** True only when the real Supabase auth path should run (wired AND keys present). */
export function supabaseAuthReady(source?: EnvSource): boolean {
  return SUPABASE_AUTH_WIRED && isSupabaseConfigured(source)
}

/** The default synthetic-email domain for username logins (see `authEmailDomain`). */
export const DEFAULT_AUTH_EMAIL_DOMAIN = 'users.dimebag.local'

/** Read one var from process.env then the Vite import.meta.env, else undefined. */
function readAmbient(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env && process.env[name] != null) {
    return process.env[name]
  }
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> }
    if (meta?.env && meta.env[name] != null) return meta.env[name]
  } catch {
    /* import.meta.env unavailable in this runtime — ignore */
  }
  return undefined
}

/**
 * Supabase Auth is email-based, but DimeBag-Bets logs in with a USERNAME. The adapter
 * maps `username` → `username@<domain>`. The domain is configurable so an operator can
 * point it at a domain they control (e.g. to enable email confirmation); it defaults to
 * a non-routable internal domain for a points app where the username IS the identity.
 */
export function authEmailDomain(source?: EnvSource): string {
  const pick = (name: string) => (source ? source[name] : readAmbient(name))
  return (
    pick('SUPABASE_AUTH_EMAIL_DOMAIN') ||
    pick('VITE_SUPABASE_AUTH_EMAIL_DOMAIN') ||
    DEFAULT_AUTH_EMAIL_DOMAIN
  )
}
