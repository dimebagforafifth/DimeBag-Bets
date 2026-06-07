import { describe, it, expect } from 'vitest'
import { createLocalStore, createMemoryStore, type StorageLike } from './store.js'
import { persistedDoc } from './doc.js'

/** A minimal in-memory Web Storage stand-in for testing the localStorage path. */
function fakeStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    get length() {
      return m.size
    },
    key: (i) => [...m.keys()][i] ?? null,
  }
}

describe('KVStore adapters', () => {
  for (const [name, make] of [
    ['memory', () => createMemoryStore()],
    ['local', () => createLocalStore({ namespace: 'ns', backing: fakeStorage() })],
  ] as const) {
    describe(name, () => {
      it('round-trips values and reports absence as null', () => {
        const s = make()
        expect(s.get('missing')).toBeNull()
        s.set('a', { n: 1, list: [1, 2] })
        expect(s.get('a')).toEqual({ n: 1, list: [1, 2] })
      })

      it('stores snapshots, not live references', () => {
        const s = make()
        const obj = { n: 1 }
        s.set('a', obj)
        obj.n = 99 // mutate the original after storing
        expect(s.get<{ n: number }>('a')!.n).toBe(1)
      })

      it('removes, lists, and clears keys', () => {
        const s = make()
        s.set('a', 1)
        s.set('b', 2)
        expect(new Set(s.keys())).toEqual(new Set(['a', 'b']))
        s.remove('a')
        expect(s.get('a')).toBeNull()
        s.clear()
        expect(s.keys()).toEqual([])
      })

      it('set(undefined) means absent uniformly: null on read, not listed', () => {
        const s = make()
        s.set('a', 1)
        s.set('a', undefined)
        expect(s.get('a')).toBeNull()
        expect(s.keys()).not.toContain('a')
      })
    })
  }

  it('namespaces local keys so stores do not collide', () => {
    const backing = fakeStorage()
    const a = createLocalStore({ namespace: 'a', backing })
    const b = createLocalStore({ namespace: 'b', backing })
    a.set('x', 1)
    b.set('x', 2)
    expect(a.get('x')).toBe(1)
    expect(b.get('x')).toBe(2)
    expect(a.keys()).toEqual(['x']) // only its own namespace
  })

  it('clear() and keys() never touch foreign keys, even with an empty namespace', () => {
    const backing = fakeStorage()
    backing.setItem('other-app-key', 'keep') // a foreign entry sharing the origin
    const s = createLocalStore({ namespace: '', backing }) // empty → defaults to a safe prefix
    s.set('x', 1)
    expect(s.keys()).toEqual(['x']) // not the foreign key
    s.clear()
    expect(s.get('x')).toBeNull()
    expect(backing.getItem('other-app-key')).toBe('keep') // foreign data survived
  })

  it('degrades to memory when storage is unavailable', () => {
    const s = createLocalStore({ backing: undefined })
    s.set('k', 'v')
    expect(s.get('k')).toBe('v') // works regardless (memory fallback)
  })

  it('treats a corrupt entry as absent rather than throwing', () => {
    const backing = fakeStorage()
    backing.setItem('ns:bad', '{not json')
    const s = createLocalStore({ namespace: 'ns', backing })
    expect(s.get('bad')).toBeNull()
  })
})

describe('persistedDoc (versioned)', () => {
  it('returns the initial when nothing is stored, then the saved value', () => {
    const doc = persistedDoc(createMemoryStore(), 'acct', { version: 1, initial: { balance: 0 } })
    expect(doc.load()).toEqual({ balance: 0 })
    doc.save({ balance: 500 })
    expect(doc.load()).toEqual({ balance: 500 })
  })

  it('migrates an older version when a migrator is given', () => {
    const store = createMemoryStore()
    persistedDoc(store, 'k', { version: 1, initial: { cents: 0 } }).save({ cents: 100 })
    // a v2 reader that renamed cents → balance
    const v2 = persistedDoc<{ balance: number }>(store, 'k', {
      version: 2,
      initial: { balance: 0 },
      migrate: (data) => ({ balance: (data as { cents: number }).cents }),
    })
    expect(v2.load()).toEqual({ balance: 100 })
  })

  it('falls back to initial on a stale version with no migrator', () => {
    const store = createMemoryStore()
    persistedDoc(store, 'k', { version: 1, initial: 'old' }).save('stored')
    const v2 = persistedDoc(store, 'k', { version: 2, initial: 'fresh' })
    expect(v2.load()).toBe('fresh')
  })

  it('reset forgets the stored value', () => {
    const doc = persistedDoc(createMemoryStore(), 'k', { version: 1, initial: 0 })
    doc.save(42)
    doc.reset()
    expect(doc.load()).toBe(0)
  })
})
