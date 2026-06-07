import { describe, it, expect } from 'vitest'
import { mapEvent, mapSlate } from './map.js'
import type { ApiEvent } from './types.js'

const sample = (over: Partial<ApiEvent> = {}): ApiEvent => ({
  id: 'evt1',
  sport_title: 'NBA',
  home_team: 'Lakers',
  away_team: 'Celtics',
  commence_time: '2026-06-06T02:30:00Z',
  bookmakers: [
    {
      key: 'dk',
      markets: [
        { key: 'h2h', outcomes: [{ name: 'Lakers', price: -135 }, { name: 'Celtics', price: 115 }] },
        {
          key: 'spreads',
          outcomes: [
            { name: 'Lakers', price: -110, point: -3.5 },
            { name: 'Celtics', price: -110, point: 3.5 },
          ],
        },
        {
          key: 'totals',
          outcomes: [
            { name: 'Over', price: -110, point: 224.5 },
            { name: 'Under', price: -110, point: 224.5 },
          ],
        },
      ],
    },
    { key: 'fd', markets: [{ key: 'h2h', outcomes: [{ name: 'Lakers', price: -150 }, { name: 'Celtics', price: 130 }] }] },
  ],
  ...over,
})

describe('mapEvent', () => {
  it('maps identity, league, and the full market set with lines', () => {
    const e = mapEvent(sample())
    expect(e).toMatchObject({ id: 'evt1', league: 'NBA', home: 'Lakers', away: 'Celtics', status: 'upcoming' })
    expect(e.selections).toHaveLength(6)

    const ml = e.selections.find((s) => s.market === 'moneyline' && s.pick === 'home')!
    expect(ml.odds).toBe(-135)
    expect(ml.label).toBe('Lakers')

    const sp = e.selections.find((s) => s.market === 'spread' && s.pick === 'home')!
    expect(sp.line).toBe(-3.5)
    expect(sp.label).toBe('Lakers -3.5')

    const tot = e.selections.find((s) => s.market === 'total' && s.pick === 'over')!
    expect(tot.line).toBe(224.5)
    expect(tot.label).toBe('Over 224.5')
  })

  it('derives live from scores, final from completed', () => {
    const live = mapEvent(sample({ scores: [{ name: 'Lakers', score: 40 }, { name: 'Celtics', score: 38 }] }))
    expect(live.status).toBe('live')
    expect(live.score).toMatchObject({ home: 40, away: 38 })
    expect(live.score?.official).toBeUndefined()

    const fin = mapEvent(
      sample({ completed: true, scores: [{ name: 'Lakers', score: 118 }, { name: 'Celtics', score: 110 }] }),
    )
    expect(fin.status).toBe('final')
    expect(fin.score).toMatchObject({ home: 118, away: 110, official: true })
  })

  it('matches scores case- and whitespace-insensitively', () => {
    const e = mapEvent(
      sample({ completed: true, scores: [{ name: ' lakers ', score: 118 }, { name: 'CELTICS', score: 110 }] }),
    )
    expect(e.status).toBe('final')
    expect(e.score).toMatchObject({ home: 118, away: 110, official: true })
  })

  it('does not report final without a usable score (so bets are not mass-voided)', () => {
    const e = mapEvent(
      sample({ status: 'final', scores: [{ name: 'Unknown', score: 1 }, { name: 'Other', score: 2 }] }),
    )
    expect(e.score).toBeUndefined()
    expect(e.status).toBe('live') // downgraded — settlement waits for a real score
  })

  it('honours an explicit status and a chosen bookmaker', () => {
    const e = mapEvent(sample({ status: 'live' }), { bookmaker: 'fd' })
    expect(e.status).toBe('live')
    expect(e.selections.find((s) => s.market === 'moneyline' && s.pick === 'home')!.odds).toBe(-150)
  })

  it('tolerates an event with no bookmakers (no selections)', () => {
    const e = mapEvent(sample({ bookmakers: [] }))
    expect(e.selections).toEqual([])
    expect(e.status).toBe('upcoming')
  })

  it('maps a whole slate', () => {
    expect(mapSlate([sample(), sample({ id: 'evt2' })])).toHaveLength(2)
  })
})
