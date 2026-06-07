import { describe, it, expect } from 'vitest'
import { createMemoryStore, persistedDoc } from '../../persistence/index.js'
import { createCommsStore, type CommsDoc } from './comms-store.js'
import { EMPTY_WEBHOOKS } from './webhooks.js'

function fresh(kv = createMemoryStore(), now: () => number = () => 1000) {
  const doc = persistedDoc<CommsDoc>(kv, 'comms', {
    version: 1,
    initial: { seq: 0, announcements: [], webhooks: { ...EMPTY_WEBHOOKS } },
  })
  return { kv, store: createCommsStore(doc, now) }
}

describe('createCommsStore', () => {
  it('publishes newest-first with id, timestamp, and expiry', () => {
    let t = 1000
    const { store } = fresh(createMemoryStore(), () => (t += 1000))
    const a = store.publish({ title: 'One', body: 'first', severity: 'info', ttlMs: 0 })
    const b = store.publish({ title: 'Two', body: 'second', severity: 'warning', ttlMs: 5000 })
    expect(a.id).toBe(1)
    expect(a.expiresAt).toBe(0) // no expiry
    expect(b.expiresAt).toBe(3000 + 5000) // authored at t=3000
    expect(store.announcements().map((x) => x.title)).toEqual(['Two', 'One'])
  })

  it('rejects an empty message', () => {
    const { store } = fresh()
    expect(() => store.publish({ title: 'x', body: '   ', severity: 'info', ttlMs: 0 })).toThrow(/needs a message/)
  })

  it('toggles active', () => {
    const { store } = fresh()
    const a = store.publish({ title: 't', body: 'b', severity: 'info', ttlMs: 0 })
    store.setActive(a.id, false)
    expect(store.announcements()[0].active).toBe(false)
  })

  it('stores webhook config and persists across reload', () => {
    const kv = createMemoryStore()
    fresh(kv).store.setWebhooks({ discordUrl: 'https://d/hook' })
    const { store } = fresh(kv)
    expect(store.webhooks().discordUrl).toBe('https://d/hook')
    expect(store.webhooks().telegramToken).toBe('') // other fields intact
  })
})
