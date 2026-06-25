import { describe, it, expect, vi } from 'vitest'
import {
  oddsUrl,
  scoresUrl,
  mergeScores,
  createOddsApiSlate,
  type FetchLike,
  type OddsApiConfig,
} from './theOddsApi.js'
import type { ApiEvent } from '../types.js'

const config: OddsApiConfig = { apiKey: 'KEY', sportKeys: ['basketball_nba'] }

const oddsEvent = (id: string): ApiEvent => ({
  id,
  sport_title: 'NBA',
  home_team: 'Lakers',
  away_team: 'Celtics',
  commence_time: '2026-06-06T02:30:00Z',
  bookmakers: [{ key: 'dk', markets: [{ key: 'h2h', outcomes: [{ name: 'Lakers', price: -135 }, { name: 'Celtics', price: 115 }] }] }],
})

/** A fetch stub mapping url-substrings to a JSON body + headers. */
function stubFetch(routes: { match: string; body: unknown; headers?: Record<string, string> }[]): FetchLike {
  return async (url: string) => {
    const route = routes.find((r) => url.includes(r.match))
    if (!route) throw new Error(`no stub for ${url}`)
    return {
      ok: true,
      status: 200,
      json: async () => route.body,
      headers: { get: (n: string) => route.headers?.[n.toLowerCase()] ?? null },
    }
  }
}

describe('URL builders', () => {
  it('builds an odds URL with key, regions, markets, format', () => {
    const u = oddsUrl(config, 'basketball_nba')
    expect(u).toContain('/sports/basketball_nba/odds/')
    expect(u).toContain('apiKey=KEY')
    expect(u).toContain('regions=us')
    expect(u).toContain('markets=h2h%2Cspreads%2Ctotals')
    expect(u).toContain('oddsFormat=american')
  })

  it('builds a scores URL with the daysFrom window', () => {
    const u = scoresUrl({ ...config, daysFrom: 2 }, 'basketball_nba')
    expect(u).toContain('/sports/basketball_nba/scores/')
    expect(u).toContain('daysFrom=2')
  })
})

describe('mergeScores', () => {
  it('grafts scores + completed onto the matching odds event (coercing strings)', () => {
    const merged = mergeScores(
      [oddsEvent('g1'), oddsEvent('g2')],
      [{ id: 'g1', completed: false, scores: [{ name: 'Lakers', score: '58' }, { name: 'Celtics', score: '55' }] }],
    )
    expect(merged[0].scores).toEqual([{ name: 'Lakers', score: 58 }, { name: 'Celtics', score: 55 }])
    expect(merged[0].completed).toBe(false)
    expect(merged[1].scores).toBeUndefined() // g2 had no score row → still pre-match
  })

  it('treats an empty score array as no live score', () => {
    const merged = mergeScores([oddsEvent('g1')], [{ id: 'g1', scores: [] }])
    expect(merged[0].scores).toBeNull()
  })
})

describe('createOddsApiSlate', () => {
  it('fetches odds + scores, merges, and reports quota', async () => {
    const quotas: number[] = []
    const slate = createOddsApiSlate({
      config,
      onQuota: (q) => q.remaining != null && quotas.push(q.remaining),
      fetchFn: stubFetch([
        { match: '/odds/', body: [oddsEvent('g1')], headers: { 'x-requests-remaining': '480', 'x-requests-used': '20' } },
        { match: '/scores/', body: [{ id: 'g1', completed: false, scores: [{ name: 'Lakers', score: '58' }, { name: 'Celtics', score: '55' }] }] },
      ]),
    })
    const events = await slate()
    expect(events).toHaveLength(1)
    expect(events[0].scores).toEqual([{ name: 'Lakers', score: 58 }, { name: 'Celtics', score: 55 }])
    expect(quotas).toEqual([480])
  })

  it('warns and drops malformed odds instead of mapping a NaN price into the slate', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const slate = createOddsApiSlate({
      config,
      includeScores: false,
      fetchFn: stubFetch([
        {
          match: '/odds/',
          body: [{ ...oddsEvent('g1'), bookmakers: [{ key: 'dk', markets: [{ key: 'h2h', outcomes: [{ name: 'Lakers', price: 'bad' }] }] }] }],
        },
      ]),
    })
    // The malformed sport contributes nothing — an empty slate, never a NaN price downstream.
    await expect(slate()).resolves.toEqual([])
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/dropping malformed odds .*outcomes\[0\]\.price/),
    )
    warn.mockRestore()
  })

  it('warns and keeps pre-match odds when score rows are malformed (no NaN score)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const slate = createOddsApiSlate({
      config,
      fetchFn: stubFetch([
        { match: '/odds/', body: [oddsEvent('g1')] },
        { match: '/scores/', body: [{ id: 'g1', completed: false, scores: [{ name: 'Lakers', score: 'not-a-score' }] }] },
      ]),
    })
    const events = await slate()
    // The pre-match odds stand; the malformed score is dropped, never coerced into a NaN.
    expect(events).toHaveLength(1)
    expect(events[0].scores).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/ignoring malformed scores .*scores\[0\]\.score/),
    )
    warn.mockRestore()
  })

  it('keeps pre-match odds when the scores call is skipped', async () => {
    const slate = createOddsApiSlate({
      config,
      includeScores: false,
      fetchFn: stubFetch([{ match: '/odds/', body: [oddsEvent('g1')] }]),
    })
    const events = await slate()
    expect(events[0].scores).toBeUndefined()
  })

  it('throws on a non-ok odds response', async () => {
    const slate = createOddsApiSlate({
      config,
      fetchFn: async () => ({ ok: false, status: 429, json: async () => [], headers: { get: () => null } }),
    })
    await expect(slate()).rejects.toThrow(/429/)
  })

  it('spans multiple sports', async () => {
    const slate = createOddsApiSlate({
      config: { ...config, sportKeys: ['basketball_nba', 'americanfootball_nfl'] },
      includeScores: false,
      fetchFn: stubFetch([{ match: '/odds/', body: [oddsEvent('g1')] }]),
    })
    expect(await slate()).toHaveLength(2) // one event per sport from the stub
  })
})
