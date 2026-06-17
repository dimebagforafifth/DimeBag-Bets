/**
 * Realtime subscription seam. Proves the env gate (no keys → no client, no-op disposer),
 * the postgres_changes wiring (one handler per watched table + an initial hydrate on
 * SUBSCRIBED + a tick per change), and the schedule adapter (null with no keys, a live
 * pusher with keys). No network, no real @supabase/supabase-js — a fake client is injected.
 */
import { describe, it, expect } from 'vitest'
import {
  subscribeToChanges,
  realtimeSchedule,
  ODDS_CACHE_TABLES,
  type CreateClientLike,
  type RealtimeChannelLike,
} from './realtime.js'

const ENV = { url: 'https://proj.supabase.co', anonKey: 'anon-key' }
const flush = () => new Promise((r) => setTimeout(r, 0))

/** A fake realtime client that records subscriptions and lets a test push a change. */
function fakeClient() {
  const handlers: Array<{ table: string; cb: () => void }> = []
  let statusCb: ((s: string) => void) | undefined
  let unsubscribed = 0
  const channel: RealtimeChannelLike = {
    on(_event, filter, cb) {
      handlers.push({ table: filter.table, cb })
      return channel
    },
    subscribe(cb) {
      statusCb = cb
      return channel
    },
    unsubscribe() {
      unsubscribed += 1
      return undefined
    },
  }
  const createClient: CreateClientLike = () => ({ channel: () => channel })
  return {
    createClient,
    handlers,
    connect: () => statusCb?.('SUBSCRIBED'),
    pushChange: (table: string) => handlers.filter((h) => h.table === table).forEach((h) => h.cb()),
    unsubscribedCount: () => unsubscribed,
  }
}

describe('subscribeToChanges', () => {
  it('is a no-op with no keys — never constructs a client', async () => {
    let made = 0
    const createClient: CreateClientLike = () => {
      made += 1
      return { channel: () => ({}) as RealtimeChannelLike }
    }
    let changes = 0
    const dispose = subscribeToChanges(() => (changes += 1), { envSource: {}, createClient })
    await flush()
    expect(made).toBe(0)
    expect(changes).toBe(0)
    dispose() // safe to call
  })

  it('subscribes one handler per odds table and hydrates on connect', async () => {
    const fake = fakeClient()
    let changes = 0
    const dispose = subscribeToChanges(() => (changes += 1), {
      env: ENV,
      createClient: fake.createClient,
    })
    await flush()
    expect(fake.handlers.map((h) => h.table)).toEqual([...ODDS_CACHE_TABLES])

    fake.connect()
    expect(changes).toBe(1) // initial hydrate on SUBSCRIBED

    fake.pushChange('odds_selections')
    expect(changes).toBe(2) // a price change triggers a re-read

    dispose()
    expect(fake.unsubscribedCount()).toBe(1)
  })

  it('does not fire after dispose', async () => {
    const fake = fakeClient()
    let changes = 0
    const dispose = subscribeToChanges(() => (changes += 1), {
      env: ENV,
      createClient: fake.createClient,
    })
    await flush()
    dispose()
    fake.pushChange('odds_events')
    // handler still wired on the fake, but the channel is unsubscribed in real use; the
    // disposer is what callers rely on. Assert the teardown happened.
    expect(fake.unsubscribedCount()).toBe(1)
    expect(changes).toBe(0)
  })
})

describe('realtimeSchedule', () => {
  it('returns null with no keys (caller falls back to interval polling)', () => {
    expect(realtimeSchedule({ envSource: {} })).toBeNull()
  })

  it('returns a scheduler that drives ticks from realtime when keys are present', async () => {
    const fake = fakeClient()
    const schedule = realtimeSchedule({ env: ENV, createClient: fake.createClient })
    expect(schedule).toBeTypeOf('function')
    let ticks = 0
    const stop = schedule!(() => (ticks += 1), 15_000)
    await flush()
    fake.connect()
    expect(ticks).toBe(1)
    fake.pushChange('odds_markets')
    expect(ticks).toBe(2)
    stop()
    expect(fake.unsubscribedCount()).toBe(1)
  })
})
