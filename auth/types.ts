import type { Role } from '../features/org/index.js'

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

/** OAuth identity providers we support (Supabase social login). Google to start;
 *  the union is the extension point for adding apple/github/etc. later. */
export type OAuthProvider = 'google'

/** A signed-in identity. `id` is the key the app resolves to a book member. */
export interface AuthUser {
  /** The session identity id — resolved to a book member via auth/accountLink. */
  id: string
  /** The login handle. Username-only for password logins (managers, agents and players
   *  log in with a username + password); for OAuth/email signups it's derived from the
   *  email local-part. */
  username: string
  displayName: string
  /**
   * The verified email on the identity, when the backend has one (OAuth always carries
   * one; a username/password demo login has none). Undefined = no email on file.
   */
  email?: string
  /**
   * Whether the identity's email has been confirmed. Undefined in the demo path (no
   * email step). In real mode the Supabase adapter sets it from `email_confirmed_at`,
   * so the gate can require a verified email before granting play. // see RP gate.
   */
  emailVerified?: boolean
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

/**
 * The result of a sign-up. Either a live session (email confirmation is OFF, so the
 * user is signed in immediately) or a pending-verification state (confirmation is ON —
 * a verification email was sent and there is no session until the link is clicked). The
 * caller branches on which arrived rather than treating "no session" as an error.
 */
export type SignUpResult =
  | { session: Session }
  | { pendingVerification: true; email: string }

/** The swappable auth backend. The demo adapter implements this locally; the Supabase
 *  adapter implements it against Supabase Auth (see auth/supabaseAdapter.ts). */
export interface AuthAdapter {
  readonly kind: 'demo' | 'supabase'
  /** The persisted session if one exists (the demo adapter may bootstrap one). */
  getSession(): Promise<Session | null>
  signIn(username: string, password: string): Promise<Session>
  signUp(username: string, password: string, displayName?: string): Promise<SignUpResult>
  /**
   * Begin an OAuth sign-in (Google, etc.). This is REDIRECT-based: the browser leaves to
   * the provider and returns to the app, where `getSession()` picks up the established
   * session from the callback URL — so the promise resolving means "redirect kicked off",
   * not "signed in". The demo adapter rejects (OAuth needs the real backend).
   */
  signInWithOAuth(provider: OAuthProvider): Promise<void>
  signOut(): Promise<void>
}

/** What `useAuth()` exposes to the app. Role/account resolution is done by consumers
 *  (they subscribe to the book), so this stays the pure session surface. */
export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  /** True when the local demo adapter is live (no Supabase keys / not yet wired). */
  isDemo: boolean
  /** True when OAuth (Google) sign-in is available — i.e. the real Supabase adapter is
   *  live. The demo adapter can't do OAuth, so the UI hides the button when this is false. */
  canUseOAuth: boolean
  signIn(username: string, password: string): Promise<void>
  /** Sign up. Resolves to the verification state so the UI can show "check your email"
   *  (confirmation ON) or proceed straight in (a session was returned). */
  signUp(username: string, password: string, displayName?: string): Promise<SignUpResult>
  /** Start a Google OAuth sign-in (redirect). Rejects in demo mode. */
  signInWithGoogle(): Promise<void>
  signOut(): Promise<void>
}
