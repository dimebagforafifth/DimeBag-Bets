import { describe, it, expect } from 'vitest'
import { mapSlate } from '../map.js'
import {
  makeProvider,
  createMockProvider,
  createSportsGameOddsProvider,
  mapSgoEvent,
  createTheOddsApiProvider,
  createOddsPapiProvider,
  withBackoff,
  createUsageLog,
  type FetchLike,
  type SgoEvent,
} from './index.js'
import type { ApiEvent } from '../types.js'

describe('makeProvider — the OddsFeedProvider composer', () => {
  it('merges scores onto odds in fetchSlate, and defaults fetchLive to the live subset', async () => {
    const odds: ApiEvent[] = [
      { id: 'a', sport_title: 'NBA', home_team: 'Lakers', away_team: 'Celtics', commence_time: 'x', bookmakers: [] },
      { id: 'b', sport_title: 'NBA', home_team: 'Heat', away_team: 'Bucks', commence_time: 'y', status: 'live', scores: [{ name: 'Heat', score: 10 }, { name: 'Bucks', score: 8 }], bookmakers: [] },
    ]
    const p = makeProvider({
      name: 't',
      fetchOdds: async () => odds,
      fetchScores: async () => [{ id: 'a', completed: true, scores: [{ name: 'Lakers', score: 101 }, { name: 'Celtics', score: 99 }] }],
    })
    const slate = await p.fetchSlate()
    // 'a' got its score grafted on from the scores feed
    expect(slate.find((e) => e.id === 'a')?.scores).toEqual([
      { name: 'Lakers', score: 101 },
      { name: 'Celtics', score: 99 },
    ])
    // fetchLive defaults to the live-only subset of the odds pull
    const live = await p.fetchLive()
    expect(live.map((e) => e.id)).toEqual(['b'])
    expect(p.usage()).toBeNull()
  })
})

describe('MockProvider — normalization end to end', () => {
  it('produces a realistic slate that normalizes into internal GameEvents', async () => {
    const slate = await createMockProvider().fetchSlate()
    const events = mapSlate(slate)

    const lal = events.find((e) => e.id === 'mock-nba-lal-bos')!
    expect(lal.status).toBe('upcoming')
    expect(lal.sport).toBe('Basketball')
    expect(lal.league).toBe('NBA')
    expect(lal.home).toBe('Lakers')
    // 6 selections: ML home/away, spread home/away, total over/under
    expect(lal.selections).toHaveLength(6)
    expect(lal.selections.find((s) => s.market === 'spread' && s.pick === 'home')?.line).toBe(-3.5)

    // the live game carries a running score
    const gsw = events.find((e) => e.id === 'mock-nba-gsw-den')!
    expect(gsw.status).toBe('live')
    expect(gsw.score).toEqual({ home: 58, away: 62, official: undefined })

    // the finished game is final with an OFFICIAL score so grading can fire
    const epl = events.find((e) => e.id === 'mock-epl-ars-mci')!
    expect(epl.status).toBe('final')
    expect(epl.score).toEqual({ home: 2, away: 1, official: true })
  })
})

describe('SportsGameOdds adapter — vendor DTO → our DTO → internal model', () => {
  const sgo: SgoEvent = {
    eventID: 'sgo-1',
    leagueID: 'NBA',
    sportID: 'BASKETBALL',
    home: { name: 'Lakers' },
    away: { name: 'Celtics' },
    startTime: '2026-06-12T23:30:00Z',
    status: 'scheduled',
    markets: [
      { type: 'moneyline', outcomes: [{ side: 'home', odds: -135 }, { side: 'away', odds: 115 }] },
      { type: 'spread', outcomes: [{ side: 'home', odds: -110, point: -3.5 }, { side: 'away', odds: -110, point: 3.5 }] },
      { type: 'total', outcomes: [{ side: 'over', odds: -110, point: 224.5 }, { side: 'under', odds: -110, point: 224.5 }] },
    ],
  }

  it('mapSgoEvent yields an ApiEvent that normalizes correctly', () => {
    const api = mapSgoEvent(sgo)
    expect(api.id).toBe('sgo-1')
    expect(api.sport_key).toBe('basketball')
    expect(api.bookmakers[0].markets.map((m) => m.key)).toEqual(['h2h', 'spreads', 'totals'])

    const [event] = mapSlate([api])
    expect(event.sport).toBe('Basketball')
    expect(event.status).toBe('upcoming')
    expect(event.selections).toHaveLength(6)
    expect(event.selections.find((s) => s.market === 'moneyline' && s.pick === 'home')?.odds).toBe(-135)
  })

  it('pulls and maps through the provider with an injected fetch', async () => {
    const fetchFn: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [sgo] }),
      headers: { get: (k) => (k === 'x-ratelimit-remaining' ? '4900' : null) },
    })
    const p = createSportsGameOddsProvider({ config: { apiKey: 'k', leagueIDs: ['NBA'] }, fetchFn })
    const slate = await p.fetchSlate()
    expect(slate).toHaveLength(1)
    expect(p.usage()).toEqual({ remaining: 4900, used: null })
  })
})

describe('TheOddsAPI provider — odds + scores endpoints, quota tracking', () => {
  it('merges the scores endpoint onto odds and records quota', async () => {
    const oddsBody: ApiEvent[] = [
      { id: 'g1', sport_key: 'basketball_nba', sport_title: 'NBA', home_team: 'Lakers', away_team: 'Celtics', commence_time: 'x', bookmakers: [] },
    ]
    const scoresBody = [{ id: 'g1', completed: true, scores: [{ name: 'Lakers', score: 110 }, { name: 'Celtics', score: 104 }] }]
    const fetchFn: FetchLike = async (url) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('/scores') ? scoresBody : oddsBody),
      headers: { get: (k) => (k === 'x-requests-remaining' ? '480' : k === 'x-requests-used' ? '20' : null) },
    })
    const p = createTheOddsApiProvider({ config: { apiKey: 'k', sportKeys: ['basketball_nba'] }, fetchFn })
    const slate = await p.fetchSlate()
    expect(slate[0].scores).toEqual([{ name: 'Lakers', score: 110 }, { name: 'Celtics', score: 104 }])
    expect(p.usage()).toEqual({ remaining: 480, used: 20 })
  })
})

describe('OddsPapi stub', () => {
  it('satisfies the interface but throws until implemented', async () => {
    const p = createOddsPapiProvider({ config: { apiKey: 'k' } })
    expect(p.name).toBe('oddspapi')
    await expect(p.fetchOdds()).rejects.toThrow(/not implemented/i)
  })
})

describe('withBackoff', () => {
  it('short-circuits inside the window after a failure, then resets on success', async () => {
    let clock = 0
    let calls = 0
    const flaky = withBackoff(
      async () => {
        calls += 1
        if (calls === 1) throw new Error('429')
        return 'ok'
      },
      { baseMs: 1000, now: () => clock },
    )

    await expect(flaky()).rejects.toThrow('429') // first call fails, arms a 1s backoff
    expect(flaky.failures()).toBe(1)
    // still inside the window → short-circuits WITHOUT calling fn (calls stays 1)
    await expect(flaky()).rejects.toThrow(/backing off/)
    expect(calls).toBe(1)
    // past the window → calls fn again, succeeds, resets
    clock = 1001
    await expect(flaky()).resolves.toBe('ok')
    expect(flaky.failures()).toBe(0)
  })
})

describe('createUsageLog', () => {
  it('records per-vendor quota and estimates burn', () => {
    const log = createUsageLog()
    log.record('theoddsapi', { remaining: 500, used: 0 }, 1)
    log.record('theoddsapi', { remaining: 480, used: 20 }, 2)
    log.record('mock', null, 3) // vendors that report nothing are ignored
    expect(log.entries()).toHaveLength(2)
    expect(log.latest('theoddsapi')?.remaining).toBe(480)
    expect(log.burn('theoddsapi')).toBe(20) // 20 used − 0 used
  })
})
