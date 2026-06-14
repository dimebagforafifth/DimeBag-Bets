/**
 * The demo auth adapter — the working identity provider until Supabase keys are
 * provisioned. It's a LOCAL, persisted credential store: real signup / login / logout
 * and session persistence, with no external service, so the app runs out of the box.
 *
 * Demo identities are linked to the seeded book members by id (so signing in as the
 * operator lands you in management, as a player lands you at the table). Passwords are
 * a shared demo constant stored in plain text — this is a throwaway LOCAL provider
 * ONLY; real credentials live in Supabase Auth, never here. // TODO(api)
 */

import { createLocalStore, persistedDoc, type Doc } from '../persistence/index.js'
import type { AuthAdapter, AuthUser, Session } from './types.js'

const store = createLocalStore({ namespace: 'dimebag' })

interface Cred {
  /** The linked book member id (becomes the AuthUser id). */
  id: string
  /** The login handle — a username, NOT an email (everyone signs in with username + password). */
  username: string
  password: string
  displayName: string
}

const DEMO_PASSWORD = 'demo'
export const DEMO_OPERATOR_USERNAME = 'operator'

/** Seeded demo logins, each linked to a member in book-store's seed (one per role). */
const SEED_CREDS: Cred[] = [
  { id: 'mgr', username: DEMO_OPERATOR_USERNAME, password: DEMO_PASSWORD, displayName: 'Operator' },
  { id: 'a-e', username: 'agent', password: DEMO_PASSWORD, displayName: 'East Desk Agent' },
  { id: 'p-marco', username: 'marco', password: DEMO_PASSWORD, displayName: 'Marco' },
]

// version 2: credentials are keyed by USERNAME (was email). Bumping discards any stale
// email-shaped creds/session persisted in a browser and re-seeds the username logins.
const CREDS: Doc<Cred[]> = persistedDoc(store, 'auth.demoCreds', { version: 2, initial: SEED_CREDS })
const SESSION: Doc<Session | null> = persistedDoc(store, 'auth.session', { version: 2, initial: null })
// Once we've bootstrapped (or the user has explicitly acted), getSession() won't
// auto-log-in again — so signing out actually stays signed out.
const BOOTSTRAPPED: Doc<boolean> = persistedDoc(store, 'auth.bootstrapped', { version: 2, initial: false })

function sessionFor(c: Cred): Session {
  const user: AuthUser = { id: c.id, username: c.username, displayName: c.displayName }
  return { user, token: `demo-${c.id}`, expiresAt: null }
}

function normUsername(username: string): string {
  return username.trim().toLowerCase()
}

export function createDemoAdapter(): AuthAdapter {
  return {
    kind: 'demo',

    async getSession() {
      const existing = SESSION.load()
      if (existing) return existing
      // First-ever load: auto-sign-in the operator so the app runs with no manual
      // login. After an explicit sign-out (BOOTSTRAPPED stays true) we stay signed out.
      if (!BOOTSTRAPPED.load()) {
        BOOTSTRAPPED.save(true)
        const op = CREDS.load().find((c) => c.username === DEMO_OPERATOR_USERNAME)
        if (op) {
          const session = sessionFor(op)
          SESSION.save(session)
          return session
        }
      }
      return null
    },

    async signIn(username, password) {
      const c = CREDS.load().find((x) => x.username === normUsername(username))
      if (!c || c.password !== password) throw new Error('Invalid username or password')
      BOOTSTRAPPED.save(true)
      const session = sessionFor(c)
      SESSION.save(session)
      return session
    },

    async signUp(username, password, displayName) {
      const u = normUsername(username)
      if (!u || !password) throw new Error('Username and password are required')
      const creds = CREDS.load()
      if (creds.some((c) => c.username === u)) throw new Error('That username is already taken')
      // A brand-new signup has no book node yet — an operator recruits/links them
      // later (in real mode via Agent 1's accounts table). Until then they're signed
      // in but unlinked, so the app shows them the "no player" state. // TODO(api)
      const cred: Cred = { id: `user-${u}`, username: u, password, displayName: displayName?.trim() || u }
      CREDS.save([...creds, cred])
      BOOTSTRAPPED.save(true)
      const session = sessionFor(cred)
      SESSION.save(session)
      return session
    },

    async signOut() {
      SESSION.save(null)
      BOOTSTRAPPED.save(true) // don't auto-bootstrap a session back in
    },
  }
}

/**
 * REDACTED credential list for the operator console — id + username only, NEVER the
 * password. The console's Customer Admin reads this to show a login STATUS (does this
 * member have a login?) without the demo password ever leaving this module. See
 * auth/credentials.ts. // TODO(api): in real mode this comes from Supabase, not here.
 */
export function listDemoCreds(): ReadonlyArray<{ id: string; username: string }> {
  return CREDS.load().map((c) => ({ id: c.id, username: c.username }))
}

/** Test helper: restore the demo auth store to its seeded, signed-out state. */
export function __resetDemoAuth(): void {
  CREDS.save([...SEED_CREDS])
  SESSION.save(null)
  BOOTSTRAPPED.save(false)
}
