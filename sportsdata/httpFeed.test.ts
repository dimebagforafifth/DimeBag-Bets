import { describe, it, expect } from 'vitest'
import { createHttpFeed, fetchJsonSlate } from './httpFeed.js'
import type { ApiEvent } from './types.js'

const ev: ApiEvent = {
  id: 'e',
  sport_title: 'NBA',
  home_team: 'A',
  away_team: 'B',
  commence_time: 't',
  bookmakers: [{ key: 'dk', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: -110 }, { name: 'B', price: -110 }] }] }],
}

describe('createHttpFeed', () => {
  it('maps the fetched slate into the snapshot and notifies subscribers', async () => {
    const feed = createHttpFeed({ fetchSlate: async () => [ev] })
    let pushed: unknown[] = []
    feed.subscribe((e) => (pushed = e))
    expect(feed.snapshot()).toEqual([]) // empty until first poll
    await feed.refresh()
    expect(feed.snapshot()).toHaveLength(1)
    expect(feed.snapshot()[0]).toMatchObject({ id: 'e', league: 'NBA' })
    expect(pushed).toHaveLength(1)
  })

  it('keeps the last good snapshot and reports a failed poll', async () => {
    let calls = 0
    const errors: unknown[] = []
    const feed = createHttpFeed({
      fetchSlate: async () => {
        calls += 1
        if (calls === 1) return [ev]
        throw new Error('502')
      },
      onError: (e) => errors.push(e),
    })
    await feed.refresh() // ok
    expect(feed.snapshot()).toHaveLength(1)
    await feed.refresh() // throws → kept
    expect(feed.snapshot()).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })

  it('unsubscribe stops further updates', async () => {
    const feed = createHttpFeed({ fetchSlate: async () => [ev] })
    let n = 0
    const off = feed.subscribe(() => (n += 1))
    await feed.refresh()
    off()
    await feed.refresh()
    expect(n).toBe(1)
  })

  it('applies the latest poll when refreshes overlap (no stale overwrite)', async () => {
    const resolvers: Array<(v: ApiEvent[]) => void> = []
    const feed = createHttpFeed({ fetchSlate: () => new Promise((res) => resolvers.push(res)) })
    const p1 = feed.refresh() // issued first (older)
    const p2 = feed.refresh() // issued second (newer)
    resolvers[1]([{ ...ev, id: 'newer' }]) // newer resolves first…
    resolvers[0]([{ ...ev, id: 'older' }]) // …older resolves later — must NOT clobber
    await Promise.all([p1, p2])
    expect(feed.snapshot()).toHaveLength(1)
    expect(feed.snapshot()[0].id).toBe('newer')
  })

  it('does not emit or mutate after stop(), even with a poll in flight', async () => {
    let resolve: (v: ApiEvent[]) => void = () => {}
    const feed = createHttpFeed({ fetchSlate: () => new Promise((r) => (resolve = r)) })
    let n = 0
    feed.subscribe(() => (n += 1))
    const p = feed.refresh()
    feed.stop()
    resolve([ev])
    await p
    expect(n).toBe(0)
    expect(feed.snapshot()).toEqual([])
  })
})

describe('fetchJsonSlate', () => {
  it('aborts a hung request after the timeout instead of stalling the feed', async () => {
    const orig = globalThis.fetch
    // A fetch that never resolves on its own, but rejects when its signal aborts.
    globalThis.fetch = ((_url: string, init: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })) as unknown as typeof fetch
    try {
      const slate = fetchJsonSlate('https://odds.example/slate', undefined, 10)
      await expect(slate()).rejects.toThrow()
    } finally {
      globalThis.fetch = orig
    }
  })
})
