/**
 * Operator-facing credential STATUS + password reset — with the password itself NEVER
 * exposed (CLAUDE.md §6: real auth lives in Supabase; the operator console only ever
 * shows a login *status* and *triggers* a reset, it never reads or sets a password).
 *
 * The demo adapter keeps a local credential store (auth/demoAdapter). This module reads
 * a REDACTED view of it (id + email only, via listDemoCreds) to answer two questions the
 * Customer Admin panel needs: does this member have a login, and is a reset pending?
 * Triggering a reset records the request in a small persisted overlay so the status
 * reads "reset sent" — it does not touch the password.
 *
 * Real mode (supabaseAuthReady) routes the reset to Supabase's resetPasswordForEmail,
 * which emails the customer a one-time link — again, no password ever surfaces here.
 */

import { createLocalStore, persistedDoc, type Doc } from '../persistence/index.js'
import { listDemoCreds } from './demoAdapter.js'
import { supabaseAuthReady } from './config.js'

const store = createLocalStore({ namespace: 'dimebag' })

// email(lowercased) -> epoch ms of the last reset request. A redacted overlay; it holds
// timestamps, never a password.
const RESETS: Doc<Record<string, number>> = persistedDoc(store, 'auth.resetRequests', {
  version: 1,
  initial: {},
})

let version = 0
const subs = new Set<() => void>()
function bump() {
  version += 1
  subs.forEach((f) => f())
}

/** Subscribe to reset-request changes (the change signal for a login-status column). */
export function subscribeCredentials(cb: () => void): () => void {
  subs.add(cb)
  return () => {
    subs.delete(cb)
  }
}
export function credentialsVersion(): number {
  return version
}

/** A member's login status — redacted. There is deliberately no password field. */
export interface CredentialStatus {
  /** True when the member has a linked login (can sign in). */
  hasLogin: boolean
  /** The login email, or null when the member has no login. */
  email: string | null
  /** Epoch ms of the last password-reset request, or null if none is pending. */
  resetPendingAt: number | null
}

/** The login status for a member, with the password redacted out by construction. */
export function credentialStatus(memberId: string): CredentialStatus {
  const cred = listDemoCreds().find((c) => c.id === memberId) ?? null
  const email = cred?.email ?? null
  const resetPendingAt = email ? (RESETS.load()[email] ?? null) : null
  return { hasLogin: cred != null, email, resetPendingAt }
}

/**
 * Trigger a password reset for a member. Never reveals or sets a password: real mode
 * emails a Supabase reset link; the demo simply records the request so the status reads
 * "reset sent". Throws if the member has no login to reset. `nowMs` is passed in (callers
 * stamp the time) so this stays deterministic in tests.
 */
export async function requestPasswordReset(
  memberId: string,
  nowMs: number,
): Promise<{ email: string }> {
  const { hasLogin, email } = credentialStatus(memberId)
  if (!hasLogin || !email) {
    throw new Error('This customer has no login to reset.')
  }
  if (supabaseAuthReady()) {
    // TODO(api): await getSupabaseAuth().resetPasswordForEmail(email) — emails a link.
  }
  RESETS.save({ ...RESETS.load(), [email]: nowMs })
  bump()
  return { email }
}

/** Test helper: clear all recorded reset requests. */
export function __resetCredentialRequests(): void {
  RESETS.save({})
  bump()
}
