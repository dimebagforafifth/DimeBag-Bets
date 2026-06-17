/**
 * Projections read the odds feed READ-ONLY: map prop markets → higher/lower rows, ignore
 * team markets, and merge the seeded demo board. Pure over a hand-built slate; the default
 * reads the live mock slate.
 */
import { describe, it, expect } from 'vitest'
import type { NormalizedEvent, Price } from '../lib/odds/contract.js'
import { resetBookOdds } from '../app/book/odds-source.js'
import { feedProjections, boardProjections, findProjection, statLabel } from './projections.js'
import { MOCK_PROJECTIONS } from './mock.js'

const price = (american: number): Price => ({ american, decimal: 1 + Math.abs(american) / 100 })

function slate(): NormalizedEvent[] {
  return [
    {
      eventId: 'nba-x',
      leagueId: 'NBA',
      sport: 'Basketball',
      home: 'Lakers',
      away: 'Celtics',
      startsAt: '2026-06-15T23:30:00Z',
      status: 'live',
      markets: [
        {
          marketId: 'nba-x-ml',
          type: 'moneyline',
          period: 'game',
          selections: [
            {
              selectionId: 'h',
              side: 'home',
              priceRaw: price(-135),
              priceDisplay: price(-130),
              bookmaker: 'mock',
              available: true,
            },
            {
              selectionId: 'a',
              side: 'away',
              priceRaw: price(115),
              priceDisplay: price(110),
              bookmaker: 'mock',
              available: true,
            },
          ],
        },
        {
          marketId: 'nba-x-prop-0',
          type: 'prop',
          period: 'game',
          statId: 'points',
          playerId: 'L. James',
          selections: [
            {
              selectionId: 'o',
              side: 'over',
              line: 27.5,
              priceRaw: price(-115),
              priceDisplay: price(-110),
              bookmaker: 'mock',
              available: true,
            },
            {
              selectionId: 'u',
              side: 'under',
              line: 27.5,
              priceRaw: price(-105),
              priceDisplay: price(-108),
              bookmaker: 'mock',
              available: true,
            },
          ],
        },
      ],
    },
  ]
}

describe('feedProjections — maps props, ignores team markets', () => {
  it('produces one projection per prop market with the line + display prices', () => {
    const projs = feedProjections(slate())
    expect(projs).toHaveLength(1) // moneyline ignored
    const p = projs[0]
    expect(p.id).toBe('nba-x:L. James:points')
    expect(p.playerName).toBe('L. James')
    expect(p.statLabel).toBe('PTS')
    expect(p.line).toBe(27.5)
    expect(p.overAmerican).toBe(-110) // display, not raw
    expect(p.underAmerican).toBe(-108)
    expect(p.live).toBe(true)
    expect(p.source).toBe('feed')
    expect(p.eventLabel).toBe('Celtics @ Lakers')
  })

  it('ignores a prop with no line', () => {
    const s = slate()
    s[0].markets[1].selections.forEach((sel) => delete (sel as { line?: number }).line)
    expect(feedProjections(s)).toHaveLength(0)
  })
})

describe('boardProjections — feed ∪ seed', () => {
  it('appends seeded projections not already on the feed', () => {
    const board = boardProjections(slate())
    expect(board.length).toBe(1 + MOCK_PROJECTIONS.length) // no id overlap with nba-x
    expect(board.filter((p) => p.source === 'seed').length).toBe(MOCK_PROJECTIONS.length)
  })

  it('the default reads the live mock slate (5 feed props + the seed board)', () => {
    resetBookOdds()
    const board = boardProjections()
    expect(board.filter((p) => p.source === 'feed').length).toBe(5) // 3 NBA + 2 NFL props in mockSlate
    expect(board.length).toBe(5 + MOCK_PROJECTIONS.length)
    // every board row is a distinct player+stat (no contradictions baked into the board)
    const keys = new Set(board.map((p) => `${p.playerId}::${p.statId}`))
    expect(keys.size).toBe(board.length)
  })
})

describe('findProjection + statLabel', () => {
  it('finds a seeded projection by id', () => {
    resetBookOdds()
    const found = findProjection('nfl-kc-buf:T. Kelce:receiving_yards')
    expect(found?.playerName).toBe('T. Kelce')
    expect(found?.statLabel).toBe('Rec Yds')
  })
  it('labels known stats and falls back to the raw id', () => {
    expect(statLabel('passing_yards')).toBe('Pass Yds')
    expect(statLabel('something_new')).toBe('something_new')
  })
})
