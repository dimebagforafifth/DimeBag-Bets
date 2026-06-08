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
  email: string
  password: string
  displayName: string
}

const DEMO_PASSWORD = 'demo'
export const DEMO_OPERATOR_EMAIL = 'operator@dimebag.local'

/** Seeded demo logins, each linked to a member in book-store's seed (one per role). */
const SEED_CREDS: Cred[] = [
  { id: 'mgr', email: DEMO_OPERATOR_EMAIL, password: DEMO_PASSWORD, displayName: 'Operator' },
  { id: 'a-e', email: 'agent@dimebag.local', password: DEMO_PASSWORD, displayName: 'East Desk Agent' },
  { id: 'p-marco', email: 'marco@dimebag.local', password: DEMO_PASSWORD, displayName: 'Marco' },
]

const CREDS: Doc<Cred[]> = persistedDoc(store, 'auth.demoCreds', { version: 1, initial: SEED_CREDS })
const SESSION: Doc<Session | null> = persistedDoc(store, 'auth.session', { version: 1, initial: null })
// Once we've bootstrapped (or the user has explicitly acted), getSession() won't
// auto-log-in again — so signing out actually stays signed out.
const BOOTSTRAPPED: Doc<boolean> = persistedDoc(store, 'auth.bootstrapped', { version: 1, initial: false })

function sessionFor(c: Cred): Session {
  const user: AuthUser = { id: c.id, email: c.email, displayName: c.displayName }
  return { user, token: `demo-${c.id}`, expiresAt: null }
}

function normEmail(email: string): string {
  return email.trim().toLowerCase()
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
        const op = CREDS.load().find((c) => c.email === DEMO_OPERATOR_EMAIL)
        if (op) {
          const session = sessionFor(op)
          SESSION.save(session)
          return session
        }
      }
      return null
    },

    async signIn(email, password) {
      const c = CREDS.load().find((x) => x.email === normEmail(email))
      if (!c || c.password !== password) throw new Error('Invalid email or password')
      BOOTSTRAPPED.save(true)
      const session = sessionFor(c)
      SESSION.save(session)
      return session
    },

    async signUp(email, password, displayName) {
      const e = normEmail(email)
      if (!e || !password) throw new Error('Email and password are required')
      const creds = CREDS.load()
      if (creds.some((c) => c.email === e)) throw new Error('An account with that email already exists')
      // A brand-new signup has no book node yet — an operator recruits/links them
      // later (in real mode via Agent 1's accounts table). Until then they're signed
      // in but unlinked, so the app shows them the "no player" state. // TODO(api)
      const cred: Cred = { id: `user-${e}`, email: e, password, displayName: displayName?.trim() || e }
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

/** Test helper: restore the demo auth store to its seeded, signed-out state. */
export function __resetDemoAuth(): void {
  CREDS.save([...SEED_CREDS])
  SESSION.save(null)
  BOOTSTRAPPED.save(false)
}
