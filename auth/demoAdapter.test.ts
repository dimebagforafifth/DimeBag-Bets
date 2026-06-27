import { describe, it, expect, beforeEach } from 'vitest'
import { createDemoAdapter, __resetDemoAuth, DEMO_OPERATOR_USERNAME } from './demoAdapter.js'

describe('demo auth adapter', () => {
  beforeEach(() => __resetDemoAuth())

  it('bootstraps the operator session on first load (app runs with no keys)', async () => {
    const s = await createDemoAdapter().getSession()
    expect(s?.user.id).toBe('mgr')
    expect(s?.user.username).toBe(DEMO_OPERATOR_USERNAME)
  })

  it('signs in with the right password and rejects the wrong one', async () => {
    const a = createDemoAdapter()
    await expect(a.signIn(DEMO_OPERATOR_USERNAME, 'wrong')).rejects.toThrow(/invalid/i)
    const s = await a.signIn(DEMO_OPERATOR_USERNAME, 'demo')
    expect(s.user.id).toBe('mgr')
  })

  it('signs up a new identity and rejects a duplicate username', async () => {
    const a = createDemoAdapter()
    const r = await a.signUp('NewUser', 'pw', 'New User')
    // The demo has no email step, so a sign-up always returns a live session.
    if (!('session' in r)) throw new Error('expected an immediate session in demo mode')
    expect(r.session.user.displayName).toBe('New User')
    expect(r.session.user.username).toBe('newuser') // normalised (lowercased)
    await expect(a.signUp('newuser', 'pw')).rejects.toThrow(/already taken/i)
  })

  it('rejects Google OAuth (needs the Supabase backend)', async () => {
    await expect(createDemoAdapter().signInWithOAuth('google')).rejects.toThrow(/Supabase/i)
  })

  it('requestPasswordReset resolves as a simulated success (no real email)', async () => {
    await expect(createDemoAdapter().requestPasswordReset('anyone@example.com')).resolves.toBeUndefined()
  })

  it('signs out and stays signed out (no auto re-login)', async () => {
    const a = createDemoAdapter()
    await a.signIn(DEMO_OPERATOR_USERNAME, 'demo')
    await a.signOut()
    expect(await a.getSession()).toBeNull()
  })

  it('persists the session across a reload (a fresh adapter instance restores it)', async () => {
    await createDemoAdapter().signIn('marco', 'demo')
    expect((await createDemoAdapter().getSession())?.user.id).toBe('p-marco')
  })
})
