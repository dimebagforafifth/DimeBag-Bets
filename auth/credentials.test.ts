import { describe, it, expect, beforeEach } from 'vitest'
import {
  credentialStatus,
  requestPasswordReset,
  __resetCredentialRequests,
} from './credentials.js'
import { __resetDemoAuth } from './demoAdapter.js'

// The seed links logins to a few members by id (mgr / a-e / p-marco); everyone else
// has no login. These tests prove the console only ever sees a REDACTED status — never
// a password — and that a reset records a pending request without touching credentials.
beforeEach(() => {
  __resetDemoAuth()
  __resetCredentialRequests()
})

describe('credentialStatus', () => {
  it('reports has-login + email for a linked member, and never a password', () => {
    const s = credentialStatus('p-marco')
    expect(s.hasLogin).toBe(true)
    expect(s.email).toBe('marco@dimebag.local')
    expect(s.resetPendingAt).toBeNull()
    // Redaction is structural: there is no password field to leak.
    expect(Object.keys(s)).toEqual(['hasLogin', 'email', 'resetPendingAt'])
    expect((s as unknown as Record<string, unknown>).password).toBeUndefined()
  })

  it('reports no login for a member with no linked credential', () => {
    expect(credentialStatus('p-lena')).toEqual({
      hasLogin: false,
      email: null,
      resetPendingAt: null,
    })
  })
})

describe('requestPasswordReset', () => {
  it('records a pending reset (timestamped) and returns the email — no password set', async () => {
    const out = await requestPasswordReset('p-marco', 1_700_000_000_000)
    expect(out).toEqual({ email: 'marco@dimebag.local' })
    expect(credentialStatus('p-marco').resetPendingAt).toBe(1_700_000_000_000)
  })

  it('throws when the member has no login to reset', async () => {
    await expect(requestPasswordReset('p-lena', 1)).rejects.toThrow(/no login/i)
  })
})
