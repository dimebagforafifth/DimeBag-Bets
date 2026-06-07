import { describe, it, expect } from 'vitest'
import { createMemoryStore, persistedDoc } from '../../persistence/index.js'
import { createAnalyticsStore, type AnalyticsDoc, type LedgerLike } from './analytics-store.js'

function led(id: number, o: Partial<LedgerLike> = {}): LedgerLike {
  return {
    id,
    time: id * 1000,
    accountId: 'A',
    gameKey: 'mines',
    game: 'Mines',
    stake: 100,
    multiplier: 0,
    profit: -100,
    outcome: 'loss',
    ...o,
  }
}

function freshStore() {
  const kv = createMemoryStore()
  const doc = persistedDoc<AnalyticsDoc>(kv, 'analytics', { version: 1, initial: { lastId: 0, records: [] } })
  return { kv, store: createAnalyticsStore(doc) }
}

describe('createAnalyticsStore', () => {
  it('ingests new ledger entries and maps them to records', () => {
    const { store } = freshStore()
    store.ingest([led(1), led(2)])
    expect(store.records().map((r) => r.seq)).toEqual([1, 2])
    expect(store.records()[0]).toMatchObject({ accountId: 'A', gameKey: 'mines', kind: 'wager', stake: 100, profit: -100 })
  })

  it('dedupes by id and applies in id order regardless of snapshot order', () => {
    const { store } = freshStore()
    store.ingest([led(1), led(2)])
    store.ingest([led(2), led(1), led(3)]) // overlap + one new
    expect(store.records().map((r) => r.seq)).toEqual([1, 2, 3])
    store.ingest([led(5), led(4)]) // newest-first snapshot
    expect(store.records().map((r) => r.seq)).toEqual([1, 2, 3, 4, 5])
  })

  it('tags a bonus gameKey as a bonus record', () => {
    const { store } = freshStore()
    store.ingest([led(1, { gameKey: 'bonus', game: 'Bonus', stake: 0, profit: 500, outcome: 'win' })])
    expect(store.records()[0]).toMatchObject({ kind: 'bonus', stake: 0, profit: 500 })
  })

  it('bumps version + notifies only when something new lands', () => {
    const { store } = freshStore()
    let hits = 0
    store.subscribe(() => (hits += 1))
    store.ingest([led(1)])
    expect(hits).toBe(1)
    store.ingest([led(1)]) // nothing new
    expect(hits).toBe(1)
    expect(store.version()).toBe(1)
  })

  it('persists across a reload (same backing store)', () => {
    const kv = createMemoryStore()
    const mk = () =>
      createAnalyticsStore(persistedDoc<AnalyticsDoc>(kv, 'analytics', { version: 1, initial: { lastId: 0, records: [] } }))
    const a = mk()
    a.ingest([led(1), led(2), led(3)])
    const b = mk() // simulate reload
    expect(b.records().map((r) => r.seq)).toEqual([1, 2, 3])
    b.ingest([led(2), led(4)]) // re-seeing old + one new
    expect(b.records().map((r) => r.seq)).toEqual([1, 2, 3, 4]) // old id ignored
  })

  it('clear() empties the log and resets the dedupe mark', () => {
    const { store } = freshStore()
    store.ingest([led(1), led(2)])
    store.clear()
    expect(store.records()).toEqual([])
    store.ingest([led(1)]) // re-ingestable after a reset
    expect(store.records().map((r) => r.seq)).toEqual([1])
  })
})
