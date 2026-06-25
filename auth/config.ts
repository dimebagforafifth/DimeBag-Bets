/**
 * Which auth backend is live. We reuse the persistence module's single env seam
 * (`isSupabaseConfigured`, which reads SUPABASE_URL / VITE_SUPABASE_URL + the anon
 * key) so auth and the data layer agree on "are we configured" and nobody forks the
 * env reading.
 */

import { isSupabaseConfigured, type EnvSource } from '../persistence/index.js'
import { readEnv } from '../lib/env.js'

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

/**
 * Supabase Auth is email-based, but DimeBag-Bets logs in with a USERNAME. The adapter
 * maps `username` → `username@<domain>`. The domain is configurable so an operator can
 * point it at a domain they control (e.g. to enable email confirmation); it defaults to
 * a non-routable internal domain for a points app where the username IS the identity.
 */
export function authEmailDomain(source?: EnvSource): string {
  const pick = (name: string) => readEnv(name, source)
  return (
    pick('SUPABASE_AUTH_EMAIL_DOMAIN') ||
    pick('VITE_SUPABASE_AUTH_EMAIL_DOMAIN') ||
    DEFAULT_AUTH_EMAIL_DOMAIN
  )
}

/**
 * Where the provider sends the browser back after an OAuth round-trip (Google → us).
 * Prefers an explicit `SUPABASE_AUTH_REDIRECT_URL` (set this to the deployed origin in
 * production — and add the exact URL to the Supabase dashboard's allowed redirect list),
 * else the current page origin at runtime, else undefined (tests / non-browser). The
 * callback lands back on the app, where `getSession()` reads the session from the URL.
 */
export function oauthRedirectUrl(source?: EnvSource): string | undefined {
  const pick = (name: string) => readEnv(name, source)
  const explicit = pick('SUPABASE_AUTH_REDIRECT_URL') || pick('VITE_SUPABASE_AUTH_REDIRECT_URL')
  if (explicit) return explicit
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return undefined
}
