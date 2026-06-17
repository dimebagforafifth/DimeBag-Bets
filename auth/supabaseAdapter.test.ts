/**
 * The Supabase auth adapter — full login/signup/session mapping with an INJECTED fake
 * client (no network, no real @supabase/supabase-js, no keys needed). Proves: username →
 * synthetic email, session mapping (member_id/tenant/role claims + expiry), metadata on
 * signup, and error propagation. The demo fallback (no keys) is covered by demoAdapter.test.
 */
import { describe, it, expect } from 'vitest'
import { createSupabaseAdapter, mapSupabaseSession, type SbAuthClient } from './supabaseAdapter.js'

const ENV = { url: 'https://proj.supabase.co', anonKey: 'anon' }
const DOMAIN = 'users.test.local'

/** A fake Supabase auth client that records calls and returns a configurable session. */
function fakeClient(session: unknown = null) {
  const calls: { signIn?: { email: string; password: string }; signUp?: unknown; signOut?: boolean } = {}
  const sb: SbAuthClient = {
    auth: {
      async getSession() {
        return { data: { session: session as never } }
      },
      async signInWithPassword(c) {
        calls.signIn = c
        return { data: { session: session as never }, error: null }
      },
      async signUp(c) {
        calls.signUp = c
        return { data: { session: session as never }, error: null }
      },
      async signOut() {
        calls.signOut = true
        return { error: null }
      },
    },
  }
  return { sb, calls }
}

const SESSION = {
  access_token: 'jwt-123',
  expires_at: 1_800_000_000, // seconds
  user: {
    id: 'auth-uid-1',
    email: 'marco@users.test.local',
    user_metadata: { username: 'marco', display_name: 'Marco P.' },
    app_metadata: { member_id: 'p-marco', tenant_id: 'book-7', role: 'player' },
  },
}

describe('mapSupabaseSession', () => {
  it('maps claims: member_id→id, tenant, role, expiry seconds→ms', () => {
    const s = mapSupabaseSession(SESSION as never)!
    expect(s.user.id).toBe('p-marco') // linked member id wins over the auth uid
    expect(s.user.username).toBe('marco')
    expect(s.user.displayName).toBe('Marco P.')
    expect(s.user.tenantId).toBe('book-7')
    expect(s.user.role).toBe('player')
    expect(s.token).toBe('jwt-123')
    expect(s.expiresAt).toBe(1_800_000_000 * 1000)
  })

  it('falls back to the auth uid + email local-part, and drops an unknown role', () => {
    const s = mapSupabaseSession({
      access_token: 't',
      user: { id: 'uid-9', email: 'dealer@x.io', app_metadata: { role: 'wizard' } },
    } as never)!
    expect(s.user.id).toBe('uid-9') // no member_id claim
    expect(s.user.username).toBe('dealer')
    expect(s.user.role).toBeUndefined() // 'wizard' isn't a real role
    expect(s.user.tenantId).toBeUndefined()
    expect(s.expiresAt).toBeNull() // no expires_at
  })

  it('returns null for no session', () => {
    expect(mapSupabaseSession(null)).toBeNull()
  })
})

describe('createSupabaseAdapter', () => {
  it('signs in with a synthetic email from the username', async () => {
    const { sb, calls } = fakeClient(SESSION)
    const adapter = createSupabaseAdapter({ env: ENV, emailDomain: DOMAIN, createClient: () => sb })
    const session = await adapter.signIn('Marco', 'pw')
    expect(calls.signIn).toEqual({ email: 'marco@users.test.local', password: 'pw' })
    expect(session.user.id).toBe('p-marco')
    expect(adapter.kind).toBe('supabase')
  })

  it('signs up with username + display name in user_metadata', async () => {
    const { sb, calls } = fakeClient(SESSION)
    const adapter = createSupabaseAdapter({ env: ENV, emailDomain: DOMAIN, createClient: () => sb })
    await adapter.signUp('Marco', 'pw', 'Marco P.')
    expect(calls.signUp).toEqual({
      email: 'marco@users.test.local',
      password: 'pw',
      options: { data: { username: 'marco', display_name: 'Marco P.' } },
    })
  })

  it('getSession maps the current session', async () => {
    const { sb } = fakeClient(SESSION)
    const adapter = createSupabaseAdapter({ env: ENV, emailDomain: DOMAIN, createClient: () => sb })
    const s = await adapter.getSession()
    expect(s?.user.username).toBe('marco')
  })

  it('signOut calls through to the client', async () => {
    const { sb, calls } = fakeClient(SESSION)
    const adapter = createSupabaseAdapter({ env: ENV, emailDomain: DOMAIN, createClient: () => sb })
    await adapter.signOut()
    expect(calls.signOut).toBe(true)
  })

  it('throws when sign-in returns an error', async () => {
    const sb: SbAuthClient = {
      auth: {
        async getSession() {
          return { data: { session: null } }
        },
        async signInWithPassword() {
          return { data: { session: null }, error: { message: 'Invalid login credentials' } }
        },
        async signUp() {
          return { data: { session: null }, error: null }
        },
        async signOut() {
          return { error: null }
        },
      },
    }
    const adapter = createSupabaseAdapter({ env: ENV, emailDomain: DOMAIN, createClient: () => sb })
    await expect(adapter.signIn('marco', 'wrong')).rejects.toThrow('Invalid login credentials')
  })

  it('rejects signup with no username/password before calling the client', async () => {
    let constructed = false
    const adapter = createSupabaseAdapter({
      env: ENV,
      emailDomain: DOMAIN,
      createClient: () => {
        constructed = true
        return fakeClient().sb
      },
    })
    await expect(adapter.signUp('', 'pw')).rejects.toThrow('Username and password are required')
    expect(constructed).toBe(false)
  })
})
