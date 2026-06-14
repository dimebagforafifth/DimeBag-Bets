/**
 * The Supabase Auth adapter — STRUCTURE ONLY (CLAUDE.md §6).
 *
 * The real signup/login/logout/session calls are marked `// TODO(api):` and are
 * intentionally NOT wired: `@supabase/supabase-js` isn't a dependency yet and no keys
 * are provisioned, so per the project rules we leave the integration stubbed and keep
 * the demo path live. `createAuthAdapter()` (auth/adapter.ts) only returns this once
 * `SUPABASE_AUTH_WIRED` is flipped AND keys are present — until then the demo adapter
 * runs and the app behaves exactly as before.
 *
 * When wiring this up:
 *   const { createClient } = await import('@supabase/supabase-js')   // add the dep
 *   const sb = createClient(env.url, env.anonKey, { auth: { persistSession: true } })
 * then map Supabase's session shape to our `Session` and implement each method below.
 */

import { getSupabaseEnv } from '../persistence/index.js'
import type { AuthAdapter } from './types.js'

export function createSupabaseAdapter(): AuthAdapter {
  const env = getSupabaseEnv()
  void env // used once the client is wired (createClient(env.url, env.anonKey))

  const notWired = (): never => {
    throw new Error('Supabase auth is configured but not yet wired — see auth/supabaseAdapter.ts (TODO(api))')
  }

  return {
    kind: 'supabase',
    // TODO(api): return mapSession(await sb.auth.getSession())
    async getSession() {
      return null
    },
    // Login is username + password (no email). TODO(api): resolve the username to its
    // account server-side (a usernames table / synthetic email), then
    //   return mapSession(await sb.auth.signInWithPassword({ ...resolved, password }))
    async signIn() {
      return notWired()
    },
    // TODO(api): create the account from { username, password, options: { data: { displayName } } }
    async signUp() {
      return notWired()
    },
    // TODO(api): await sb.auth.signOut()
    async signOut() {
      return notWired()
    },
  }
}
