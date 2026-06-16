/**
 * The mock slate must match the SGO odds CONTRACT exactly (so the book renders the
 * same against mock or the real cache), cover the Big 6 + a live game, and carry a
 * priceDisplay that's actually the raw price after a house margin (the seam the UI
 * reads). Credits/prices only.
 */
import { describe, it, expect } from 'vitest'
import { mockSlate, MOCK_LEAGUES } from './mockBook.js'
import type { Period, MarketType } from '../../lib/odds/contract.js'

const MARKET_TYPES: MarketType[] = ['moneyline', 'spread', 'total', 'prop']
const PERIODS: Period[] = ['game', '1h', '2h', '1q', '2q', '3q', '4q', 'ot']

describe('mock slate — contract conformance', () => {
  it('every event/market/selection matches the contract shape', () => {
    const slate = mockSlate()
    expect(slate.length).toBeGreaterThanOrEqual(6)
    for (const ev of slate) {
      expect(typeof ev.eventId).toBe('string')
      expect(typeof ev.leagueId).toBe('string')
      expect(ev.home && ev.away).toBeTruthy()
      expect(['pre', 'live', 'ended']).toContain(ev.status)
      expect(ev.markets.length).toBeGreaterThan(0)
      for (const m of ev.markets) {
        expect(MARKET_TYPES).toContain(m.type)
        expect(PERIODS).toContain(m.period)
        expect(m.selections.length).toBeGreaterThan(0)
        for (const s of m.selections) {
          expect(typeof s.selectionId).toBe('string')
          expect(typeof s.side).toBe('string')
          expect(typeof s.priceRaw.american).toBe('number')
          expect(typeof s.priceRaw.decimal).toBe('number')
          expect(typeof s.priceDisplay.american).toBe('number')
          expect(typeof s.priceDisplay.decimal).toBe('number')
          expect(typeof s.bookmaker).toBe('string')
          expect(typeof s.available).toBe('boolean')
        }
      }
    }
  })

  it('covers the Big 6 leagues and at least one live game', () => {
    const slate = mockSlate()
    expect(MOCK_LEAGUES).toEqual(['NBA', 'NFL', 'MLB', 'NHL', 'EPL', 'UCL'])
    expect(slate.some((e) => e.status === 'live')).toBe(true)
  })

  it('covers moneyline, spread, total, props and alternate lines', () => {
    const slate = mockSlate()
    const types = new Set(slate.flatMap((e) => e.markets.map((m) => m.type)))
    expect(types).toEqual(new Set(['moneyline', 'spread', 'total', 'prop']))
    // a player prop carries a player + stat
    const prop = slate.flatMap((e) => e.markets).find((m) => m.type === 'prop')
    expect(prop?.playerId).toBeTruthy()
    expect(prop?.statId).toBeTruthy()
    // alternate lines: at least one event has >1 spread market (main + alts)
    expect(slate.some((e) => e.markets.filter((m) => m.type === 'spread').length > 1)).toBe(true)
  })

  it('priceDisplay is the raw price shaded by the house margin (never shows raw)', () => {
    for (const ev of mockSlate()) {
      for (const m of ev.markets) {
        for (const s of m.selections) {
          // a positive hold → the displayed decimal pays strictly less than raw
          expect(s.priceDisplay.decimal).toBeLessThan(s.priceRaw.decimal)
        }
      }
    }
  })
})
