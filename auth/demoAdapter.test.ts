import { describe, it, expect, beforeEach } from 'vitest'
import { createDemoAdapter, __resetDemoAuth, DEMO_OPERATOR_EMAIL } from './demoAdapter.js'

describe('demo auth adapter', () => {
  beforeEach(() => __resetDemoAuth())

  it('bootstraps the operator session on first load (app runs with no keys)', async () => {
    const s = await createDemoAdapter().getSession()
    expect(s?.user.id).toBe('mgr')
    expect(s?.user.email).toBe(DEMO_OPERATOR_EMAIL)
  })

  it('signs in with the right password and rejects the wrong one', async () => {
    const a = createDemoAdapter()
    await expect(a.signIn(DEMO_OPERATOR_EMAIL, 'wrong')).rejects.toThrow(/invalid/i)
    const s = await a.signIn(DEMO_OPERATOR_EMAIL, 'demo')
    expect(s.user.id).toBe('mgr')
  })

  it('signs up a new identity and rejects a duplicate email', async () => {
    const a = createDemoAdapter()
    const s = await a.signUp('New@X.com', 'pw', 'New User')
    expect(s.user.displayName).toBe('New User')
    expect(s.user.email).toBe('new@x.com') // normalised
    await expect(a.signUp('new@x.com', 'pw')).rejects.toThrow(/already exists/i)
  })

  it('signs out and stays signed out (no auto re-login)', async () => {
    const a = createDemoAdapter()
    await a.signIn(DEMO_OPERATOR_EMAIL, 'demo')
    await a.signOut()
    expect(await a.getSession()).toBeNull()
  })

  it('persists the session across a reload (a fresh adapter instance restores it)', async () => {
    await createDemoAdapter().signIn('marco@dimebag.local', 'demo')
    expect((await createDemoAdapter().getSession())?.user.id).toBe('p-marco')
  })
})
