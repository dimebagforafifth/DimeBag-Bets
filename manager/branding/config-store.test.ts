import { describe, it, expect } from 'vitest'
import { createMemoryStore, persistedDoc } from '../../persistence/index.js'
import { createBookConfigStore } from './config-store.js'
import { DEFAULT_BOOK_CONFIG, type BookConfig } from './config.js'

function fresh(kv = createMemoryStore()) {
  const doc = persistedDoc<BookConfig>(kv, 'cfg', { version: 1, initial: DEFAULT_BOOK_CONFIG })
  const applied: BookConfig[] = []
  const store = createBookConfigStore(doc, (c) => applied.push(c))
  return { kv, store, applied }
}

describe('createBookConfigStore', () => {
  it('applies the loaded config once on creation', () => {
    const { applied } = fresh()
    expect(applied).toHaveLength(1)
    expect(applied[0]).toEqual(DEFAULT_BOOK_CONFIG)
  })

  it('update merges, normalizes, applies, and notifies', () => {
    const { store, applied } = fresh()
    let hits = 0
    store.subscribe(() => (hits += 1))
    store.update({ name: 'Acme', accent: '#101010' })
    expect(store.config().name).toBe('Acme')
    expect(store.config().accent).toBe('#101010')
    expect(applied).toHaveLength(2) // create + update
    expect(applied[1].name).toBe('Acme')
    expect(hits).toBe(1)
    expect(store.version()).toBe(1)
  })

  it('deep-merges the money block (other fields preserved)', () => {
    const { store } = fresh()
    store.update({ money: { symbol: '₵' } as BookConfig['money'] })
    expect(store.config().money).toMatchObject({ symbol: '₵', decimals: 2, locale: 'en-US', symbolPosition: 'before' })
  })

  it('drops an invalid accent on update', () => {
    const { store } = fresh()
    store.update({ accent: 'not-a-color' })
    expect(store.config().accent).toBe('')
  })

  it('persists across a reload and reset() restores defaults', () => {
    const kv = createMemoryStore()
    fresh(kv).store.update({ name: 'Persisted Co' })
    const { store } = fresh(kv) // reload
    expect(store.config().name).toBe('Persisted Co')
    store.reset()
    expect(store.config()).toEqual(DEFAULT_BOOK_CONFIG)
  })
})
