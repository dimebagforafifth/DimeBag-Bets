import { describe, it, expect } from 'vitest'
import { createMemoryStore, persistedDoc } from '../../persistence/index.js'
import { createPromoStore, type PromoLogDoc } from './promo-store.js'

function freshDoc(kv = createMemoryStore()) {
  return { kv, doc: persistedDoc<PromoLogDoc>(kv, 'promos', { version: 1, initial: { seq: 0, campaigns: [] } }) }
}

const draft = (over = {}) => ({
  targetId: 'mgr',
  targetName: 'Book',
  type: 'bonus' as const,
  perPlayer: 1000,
  players: 2,
  total: 2000,
  ...over,
})

describe('createPromoStore', () => {
  it('adds campaigns newest-first with incrementing ids + injected time', () => {
    let t = 1000
    const { doc } = freshDoc()
    const store = createPromoStore(doc, () => (t += 1))
    const a = store.add(draft({ targetName: 'First' }))
    const b = store.add(draft({ targetName: 'Second' }))
    expect(a.id).toBe(1)
    expect(b.id).toBe(2)
    expect(a.time).toBe(1001)
    expect(store.campaigns().map((c) => c.targetName)).toEqual(['Second', 'First']) // newest first
  })

  it('bumps version + notifies on add', () => {
    const { doc } = freshDoc()
    const store = createPromoStore(doc, () => 0)
    let hits = 0
    store.subscribe(() => (hits += 1))
    store.add(draft())
    expect(hits).toBe(1)
    expect(store.version()).toBe(1)
  })

  it('persists across a reload', () => {
    const kv = createMemoryStore()
    const mk = () => createPromoStore(freshDoc(kv).doc, () => 0)
    mk().add(draft({ targetName: 'Kept' }))
    expect(mk().campaigns().map((c) => c.targetName)).toEqual(['Kept'])
  })
})
