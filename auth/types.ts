import type { Role } from '../org/index.js'

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
  /** The login handle. Username-only — no email is used to sign in (managers, agents
   *  and players all log in with a username + password). */
  username: string
  displayName: string
  /**
   * The role carried by the authenticated session, when the backend asserts one.
   * Optional + backward-compatible: undefined means "resolve the role from the book
   * member" (today's demo path). The Supabase adapter populates it from the JWT's
   * `app_metadata.role` claim so the gate can trust the SERVER's role, not a client
   * guess. Consumers may prefer this when present. // TODO(api): set the claim at login.
   */
  role?: Role
  /**
   * Which BOOK (tenant) this identity belongs to. Optional + backward-compatible:
   * undefined means the default book (today's single-tenant demo). The app sets the
   * active tenant from this at boot (`setActiveTenant(user.tenantId)`) so every store
   * is scoped to the operator's own book. Populated from the Supabase org claim in real
   * mode; the demo leaves it undefined. // TODO(api)
   */
  tenantId?: string
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
  signIn(username: string, password: string): Promise<Session>
  signUp(username: string, password: string, displayName?: string): Promise<Session>
  signOut(): Promise<void>
}

/** What `useAuth()` exposes to the app. Role/account resolution is done by consumers
 *  (they subscribe to the book), so this stays the pure session surface. */
export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** True when the local demo adapter is live (no Supabase keys / not yet wired). */
  isDemo: boolean
  signIn(username: string, password: string): Promise<void>
  signUp(username: string, password: string, displayName?: string): Promise<void>
  signOut(): Promise<void>
}
