/**
 * Two tenants are provably isolated through the Supabase document path too. With keys
 * present, each book's documents go to its own per-tenant `namespace` in `kv_documents`;
 * one tenant's store cannot read another's, and a fresh session hydrates only its own
 * book. (Mirrors the money-table isolation in supabase-money.test.ts, at the doc layer.)
 */

import { describe, it, expect, afterEach } from 'vitest'
import { createStore } from './select.js'
import { setActiveTenant, __resetTenant } from './tenant.js'
import { createFakeSupabaseServer } from './supabase/fake-server.js'
import type { SupabaseStore } from './supabase-store.js'

const KEYS = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon' }

afterEach(() => __resetTenant())

describe('two tenants isolated through Supabase documents', () => {
  it('each book writes to its own namespace; neither can read the other', async () => {
    const server = createFakeSupabaseServer() // shared backend for both tenants

    setActiveTenant('acme')
    const acme = createStore({ namespace: 'dimebag', envSource: KEYS, fetchImpl: server.fetch }) as SupabaseStore
    await acme.ready
    acme.set('book.org', { mgr: 'acme' })
    await acme.flush()

    setActiveTenant('zenith')
    const zenith = createStore({ namespace: 'dimebag', envSource: KEYS, fetchImpl: server.fetch }) as SupabaseStore
    await zenith.ready
    expect(zenith.get('book.org')).toBeNull() // cannot see acme's book
    zenith.set('book.org', { mgr: 'zenith' })
    await zenith.flush()

    // Server keeps them in separate per-tenant namespaces.
    expect(server.kvRows('dimebag~t~acme')).toEqual([{ key: 'book.org', value: { mgr: 'acme' } }])
    expect(server.kvRows('dimebag~t~zenith')).toEqual([{ key: 'book.org', value: { mgr: 'zenith' } }])

    // A fresh acme session hydrates ONLY acme's book from the server.
    setActiveTenant('acme')
    const acme2 = createStore({ namespace: 'dimebag', envSource: KEYS, fetchImpl: server.fetch }) as SupabaseStore
    await acme2.ready
    expect(acme2.get('book.org')).toEqual({ mgr: 'acme' })
  })
})
