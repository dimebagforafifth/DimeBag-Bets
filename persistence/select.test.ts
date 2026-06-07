import { describe, it, expect } from 'vitest'
import { createStore } from './select.js'
import { persistedDoc } from './doc.js'
import { createFakeSupabaseServer } from './supabase/fake-server.js'
import type { SupabaseStore } from './supabase-store.js'

const KEYS = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon' }

describe('createStore (env-aware selector)', () => {
  it('returns a localStorage-equivalent store when no keys are set', () => {
    const s = createStore({ namespace: 'ns', envSource: {} })
    s.set('k', { v: 1 })
    expect(s.get('k')).toEqual({ v: 1 })
    // it's NOT the Supabase variant — no ready/flush surface
    expect((s as Partial<SupabaseStore>).flush).toBeUndefined()
  })

  it('returns the Supabase-backed store when keys are present, round-tripping through the server', async () => {
    const server = createFakeSupabaseServer()
    const write = createStore({
      namespace: 'dimebag',
      envSource: KEYS,
      fetchImpl: server.fetch,
    }) as SupabaseStore
    write.set('settings.config', { theme: 'dark' })
    await write.flush()
    // the document reached the server table
    expect(server.kvRows('dimebag')).toContainEqual({
      key: 'settings.config',
      value: { theme: 'dark' },
    })

    // a fresh "session" against the same server hydrates the same document
    const read = createStore({
      namespace: 'dimebag',
      envSource: KEYS,
      fetchImpl: server.fetch,
    }) as SupabaseStore
    await read.ready
    expect(read.get('settings.config')).toEqual({ theme: 'dark' })
  })

  it('persistedDoc works unchanged over the Supabase store (the seam is identical)', async () => {
    const server = createFakeSupabaseServer()
    const store = createStore({ namespace: 'dimebag', envSource: KEYS, fetchImpl: server.fetch }) as SupabaseStore
    const doc = persistedDoc<{ figure: number }>(store, 'book.fig', { version: 1, initial: { figure: 0 } })
    expect(doc.load()).toEqual({ figure: 0 })
    doc.save({ figure: 1234 })
    expect(doc.load()).toEqual({ figure: 1234 })
    await store.flush()
    // the envelope (with its version stamp) is what landed on the server
    expect(server.kvRows('dimebag')).toContainEqual({
      key: 'book.fig',
      value: { v: 1, data: { figure: 1234 } },
    })
  })
})
