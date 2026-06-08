/**
 * Auth module types (CLAUDE.md §6 — Supabase is the one backend service).
 *
 * The auth layer sits in front of the app shell: it establishes WHO is using the app
 * (a session), and the app maps that identity onto a book member (their account/org
 * node) to decide what they can reach. Money never lives here — it stays in `core`.
 *
 * An `AuthAdapter` is the swappable backend: a local demo adapter (the working path
 * until keys are provisioned) and a Supabase adapter (real signup/login/sessions,
 * switched on by env keys). Both satisfy this one interface so nothing upstream cares
 * which is live.
 */

/** A signed-in identity. `id` is the key the app resolves to a book member. */
export interface AuthUser {
  /** The session identity id — resolved to a book member via auth/accountLink. */
  id: string
  email: string
  displayName: string
}

/** An established session. `token` is opaque (a demo marker; a real JWT under Supabase). */
export interface Session {
  user: AuthUser
  token: string
  /** Epoch ms the session expires, or null for a non-expiring demo session. */
  expiresAt: number | null
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

/** The swappable auth backend. The demo adapter implements this locally; the Supabase
 *  adapter implements it against Supabase Auth (see auth/supabaseAdapter.ts). */
export interface AuthAdapter {
  readonly kind: 'demo' | 'supabase'
  /** The persisted session if one exists (the demo adapter may bootstrap one). */
  getSession(): Promise<Session | null>
  signIn(email: string, password: string): Promise<Session>
  signUp(email: string, password: string, displayName?: string): Promise<Session>
  signOut(): Promise<void>
}

/** What `useAuth()` exposes to the app. Role/account resolution is done by consumers
 *  (they subscribe to the book), so this stays the pure session surface. */
export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** True when the local demo adapter is live (no Supabase keys / not yet wired). */
  isDemo: boolean
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, displayName?: string): Promise<void>
  signOut(): Promise<void>
}
