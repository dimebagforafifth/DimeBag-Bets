import { describe, it, expect } from 'vitest'
import { createSupabaseStore } from './supabase-store.js'
import { createMemoryStore } from './store.js'
import type { KvRow, SupabaseKvTransport } from './supabase/kv-transport.js'

/** An in-memory transport that records calls — the server, faked at the seam. */
function fakeTransport(seed: KvRow[] = []) {
  const rows = new Map<string, unknown>(seed.map((r) => [r.key, r.value]))
  const calls = { upsert: 0, remove: 0, loadAll: 0 }
  let failNext = false
  const transport: SupabaseKvTransport = {
    async loadAll() {
      calls.loadAll++
      return [...rows.entries()].map(([key, value]) => ({ key, value }))
    },
    async upsert(key, value) {
      if (failNext) {
        failNext = false
        throw new Error('network down')
      }
      calls.upsert++
      rows.set(key, value)
    },
    async remove(key) {
      calls.remove++
      rows.delete(key)
    },
  }
  return { transport, rows, calls, failSoon: () => (failNext = true) }
}

describe('createSupabaseStore (write-through cache)', () => {
  it('reads/writes synchronously like the memory adapter', () => {
    const { transport } = fakeTransport()
    const s = createSupabaseStore({ transport, autoHydrate: false })
    expect(s.get('missing')).toBeNull()
    s.set('a', { n: 1, list: [1, 2] })
    expect(s.get('a')).toEqual({ n: 1, list: [1, 2] })
    // snapshot semantics: stored value is a copy, not a live ref
    const obj = { n: 1 }
    s.set('b', obj)
    obj.n = 99
    expect(s.get<{ n: number }>('b')!.n).toBe(1)
    // set(undefined) === absent, like memory/localStorage
    s.set('a', undefined)
    expect(s.get('a')).toBeNull()
    expect(s.keys()).not.toContain('a')
  })

  it('mirrors every write to the transport in the background (await flush)', async () => {
    const { transport, rows, calls } = fakeTransport()
    const s = createSupabaseStore({ transport, autoHydrate: false })
    s.set('x', 1)
    s.set('y', 2)
    s.remove('x')
    await s.flush()
    expect(calls.upsert).toBe(2)
    expect(calls.remove).toBe(1)
    expect(rows.get('y')).toBe(2)
    expect(rows.has('x')).toBe(false)
  })

  it('hydrate() overlays the server snapshot into the cache and resolves ready', async () => {
    const { transport } = fakeTransport([{ key: 'server-only', value: 'hi' }])
    const s = createSupabaseStore({ transport }) // autoHydrate on
    await s.ready
    expect(s.get('server-only')).toBe('hi')
  })

  it('seeds the cache from the fallback synchronously and pushes local-only keys up on hydrate', async () => {
    const fallback = createMemoryStore()
    fallback.set('local-book', { figure: 500 })
    const { transport, rows } = fakeTransport([{ key: 'server-only', value: 1 }])
    const s = createSupabaseStore({ transport, fallback })
    // available immediately, before any network round-trip
    expect(s.get('local-book')).toEqual({ figure: 500 })
    await s.ready
    await s.flush()
    expect(s.get('server-only')).toBe(1) // server overlaid
    expect(rows.get('local-book')).toEqual({ figure: 500 }) // local-only pushed up
  })

  it('absorbs a failed server write (counts it) without throwing — fallback keeps the value', async () => {
    const fallback = createMemoryStore()
    const { transport, failSoon } = fakeTransport()
    const s = createSupabaseStore({ transport, fallback, autoHydrate: false })
    failSoon()
    expect(() => s.set('k', 'v')).not.toThrow() // synchronous caller is never affected
    await s.flush()
    expect(s.failedWrites()).toBe(1)
    expect(s.get('k')).toBe('v') // cache still has it
    expect(fallback.get('k')).toBe('v') // and the offline copy survived
  })

  it('clear() empties the cache and deletes every namespace key on the server', async () => {
    const { transport, rows } = fakeTransport()
    const s = createSupabaseStore({ transport, autoHydrate: false })
    s.set('a', 1)
    s.set('b', 2)
    await s.flush()
    s.clear()
    expect(s.keys()).toEqual([])
    await s.flush()
    expect(rows.size).toBe(0)
  })
})
