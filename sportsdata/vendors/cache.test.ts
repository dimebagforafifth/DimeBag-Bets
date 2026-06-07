import { describe, it, expect } from 'vitest'
import { etagFetch, cachedSlate, createQuotaTracker, type RawFetch } from './cache.js'
import type { ApiEvent } from '../types.js'

const ev = (id: string): ApiEvent => ({
  id,
  sport_title: 'NBA',
  home_team: 'A',
  away_team: 'B',
  commence_time: 't',
  bookmakers: [],
})

describe('etagFetch', () => {
  it('serves the cached body on a 304 and re-downloads on a new ETag', async () => {
    let version = 1
    const calls: { ifNoneMatch?: string }[] = []
    const raw: RawFetch = async (_url, init) => {
      const inm = init?.headers?.['If-None-Match']
      calls.push({ ifNoneMatch: inm })
      if (inm === `etag-${version}`) {
        return { ok: false, status: 304, json: async () => ({}), headers: { get: () => `etag-${version}` } }
      }
      const body = [ev(`v${version}`)]
      return { ok: true, status: 200, json: async () => body, headers: { get: (n) => (n === 'etag' ? `etag-${version}` : null) } }
    }
    const f = etagFetch(raw)

    const first = await (await f('u')).json()
    expect(first).toEqual([ev('v1')]) // downloaded, etag-1 cached

    const second = await f('u') // sends If-None-Match: etag-1 → 304 → cached body
    expect(second.status).toBe(304)
    expect(second.ok).toBe(true)
    expect(await second.json()).toEqual([ev('v1')])
    expect(calls[1].ifNoneMatch).toBe('etag-1')

    version = 2 // data changes → new etag, fresh body
    const third = await (await f('u')).json()
    expect(third).toEqual([ev('v2')])
  })
})

describe('cachedSlate', () => {
  it('throttles real fetches within the interval', async () => {
    let clock = 1000
    let hits = 0
    const slate = cachedSlate(
      async () => {
        hits += 1
        return [ev(`h${hits}`)]
      },
      { minIntervalMs: 5000, now: () => clock },
    )
    expect(await slate()).toEqual([ev('h1')]) // real fetch
    clock = 3000
    expect(await slate()).toEqual([ev('h1')]) // within window → cached
    expect(hits).toBe(1)
    clock = 7000
    expect(await slate()).toEqual([ev('h2')]) // window passed → real fetch
    expect(hits).toBe(2)
  })

  it('serves the last good slate on a transient error', async () => {
    let clock = 0
    let fail = false
    const slate = cachedSlate(
      async () => {
        if (fail) throw new Error('boom')
        return [ev('ok')]
      },
      { minIntervalMs: 0, now: () => (clock += 1000) },
    )
    expect(await slate()).toEqual([ev('ok')])
    fail = true
    expect(await slate()).toEqual([ev('ok')]) // stale fallback
  })

  it('rethrows when there is no prior good slate', async () => {
    const slate = cachedSlate(async () => {
      throw new Error('boom')
    })
    await expect(slate()).rejects.toThrow('boom')
  })
})

describe('createQuotaTracker', () => {
  it('records the latest figures and flags a low budget', () => {
    const q = createQuotaTracker()
    expect(q.remaining()).toBeNull()
    q.record({ remaining: 480, used: 20 })
    expect(q.remaining()).toBe(480)
    expect(q.used()).toBe(20)
    expect(q.low(100)).toBe(false)
    q.record({ remaining: 50, used: 450 })
    expect(q.low(100)).toBe(true)
  })
})
