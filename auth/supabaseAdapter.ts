/**
 * The Supabase Auth adapter (CLAUDE.md §6) — real signup / login / logout / session over
 * Supabase Auth, behind the same `AuthAdapter` interface as the demo adapter so nothing
 * upstream cares which is live.
 *
 * Gating: `createAuthAdapter()` (auth/adapter.ts) returns this ONLY when keys are present
 * (`supabaseAuthReady()`); with no keys the demo adapter runs and the app behaves exactly
 * as before. `@supabase/supabase-js` is LAZY-imported so it never enters the bundle unless
 * this adapter actually constructs a client (i.e. keys are present). The client factory is
 * injectable so tests exercise the full mapping with no network and no real package.
 *
 * Username, not email: DimeBag-Bets logs in with a username. Supabase Auth is email-based,
 * so we map `username` → `username@<domain>` (auth/config.ts authEmailDomain). The username
 * + display name ride in `user_metadata`; the book member id / tenant / role come from the
 * server-set `app_metadata` claims, which is why the gate can trust them. Money never lives
 * here — it stays in `core`.
 */

import { getSupabaseEnv, type SupabaseEnv } from '../persistence/index.js'
import { authEmailDomain } from './config.js'
import type { Role } from '../org/index.js'
import type { AuthAdapter, AuthUser, Session } from './types.js'

/* ── the slice of supabase-js we depend on (so a fake can stand in) ─────────────── */
interface SbUser {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
  app_metadata?: Record<string, unknown> | null
}
interface SbSession {
  access_token: string
  /** Epoch SECONDS (Supabase convention). */
  expires_at?: number | null
  user: SbUser
}
interface SbAuthResult {
  data: { session: SbSession | null }
  error: { message: string } | null
}
export interface SbAuthClient {
  auth: {
    getSession(): Promise<{ data: { session: SbSession | null } }>
    signInWithPassword(c: { email: string; password: string }): Promise<SbAuthResult>
    signUp(c: {
      email: string
      password: string
      options?: { data?: Record<string, unknown> }
    }): Promise<SbAuthResult>
    signOut(): Promise<{ error: { message: string } | null }>
  }
}
export type SbCreateClient = (url: string, key: string, opts?: unknown) => SbAuthClient

const ROLES: ReadonlySet<string> = new Set(['manager', 'subagent', 'agent', 'player'])

function normUsername(username: string): string {
  return username.trim().toLowerCase()
}

function asRole(v: unknown): Role | undefined {
  return typeof v === 'string' && ROLES.has(v) ? (v as Role) : undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

/** Supabase session → our `Session`. Identity id, tenant and role come from app_metadata
 *  (server-set claims); username + display name from user_metadata, with email/local-part
 *  fallbacks. Returns null for no session. */
export function mapSupabaseSession(s: SbSession | null): Session | null {
  if (!s) return null
  const meta = (s.user.user_metadata ?? {}) as Record<string, unknown>
  const app = (s.user.app_metadata ?? {}) as Record<string, unknown>
  const username = str(meta.username) ?? str(s.user.email)?.split('@')[0] ?? 'user'
  const user: AuthUser = {
    // The linked book member id when the operator has linked the account; else the auth uid
    // (an unlinked sign-up lands in the "no player" state, same as the demo adapter).
    id: str(app.member_id) ?? s.user.id,
    username,
    displayName: str(meta.display_name) ?? username,
  }
  const tenantId = str(app.tenant_id)
  if (tenantId) user.tenantId = tenantId
  const role = asRole(app.role)
  if (role) user.role = role
  return { user, token: s.access_token, expiresAt: s.expires_at ? s.expires_at * 1000 : null }
}

export interface SupabaseAdapterDeps {
  /** Resolved env (tests). Default: the ambient SUPABASE_* keys. */
  env?: SupabaseEnv | null
  /** Synthetic-email domain (tests). Default: authEmailDomain(). */
  emailDomain?: string
  /** Injectable client factory (tests). Default: lazy `@supabase/supabase-js` createClient. */
  createClient?: SbCreateClient
}

export function createSupabaseAdapter(deps: SupabaseAdapterDeps = {}): AuthAdapter {
  const env = deps.env ?? getSupabaseEnv()
  const domain = deps.emailDomain ?? authEmailDomain()
  let clientPromise: Promise<SbAuthClient> | null = null

  const getClient = (): Promise<SbAuthClient> => {
    if (!env) {
      return Promise.reject(new Error('Supabase auth requires SUPABASE_URL + SUPABASE_ANON_KEY'))
    }
    if (deps.createClient) return Promise.resolve(deps.createClient(env.url, env.anonKey))
    if (!clientPromise) {
      clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
        (createClient as unknown as SbCreateClient)(env.url, env.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        }),
      )
    }
    return clientPromise
  }

  const toEmail = (username: string): string => `${normUsername(username)}@${domain}`

  return {
    kind: 'supabase',

    async getSession() {
      const sb = await getClient()
      const { data } = await sb.auth.getSession()
      return mapSupabaseSession(data.session)
    },

    async signIn(username, password) {
      const sb = await getClient()
      const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(username), password })
      if (error) throw new Error(error.message || 'Invalid username or password')
      const session = mapSupabaseSession(data.session)
      if (!session) throw new Error('Sign-in did not return a session')
      return session
    },

    async signUp(username, password, displayName) {
      const u = normUsername(username)
      if (!u || !password) throw new Error('Username and password are required')
      const sb = await getClient()
      const { data, error } = await sb.auth.signUp({
        email: toEmail(u),
        password,
        options: { data: { username: u, display_name: displayName?.trim() || u } },
      })
      if (error) throw new Error(error.message)
      const session = mapSupabaseSession(data.session)
      // With email confirmation OFF (the points-app default), signUp returns a session. If a
      // project turns confirmation ON there's no session yet — surface that, don't pretend.
      if (!session) throw new Error('Account created — confirm the email before signing in')
      return session
    },

    async signOut() {
      const sb = await getClient()
      const { error } = await sb.auth.signOut()
      if (error) throw new Error(error.message)
    },
  }
}
