/**
 * The dev snapshot bridge: connectSnapshot loads a real slate from a static URL and flips
 * the book's source to 'live' (so a local demo shows real games with no Supabase), and a
 * failed fetch keeps the last good slate. Odds only — credits/balance stay in core.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { connectSnapshot, getBookOddsSnapshot, isLiveOdds, resetBookOdds } from './odds-source.js'
import type { NormalizedEvent } from '../../lib/odds/contract.js'

const SLATE: NormalizedEvent[] = [
  {
    eventId: 'real-1',
    leagueId: 'MLB',
    sport: 'BASEBALL',
    home: 'Athletics',
    away: 'Pirates',
    startsAt: '2026-06-16T01:40:00Z',
    status: 'live',
    markets: [],
  },
]

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => resetBookOdds())

describe('connectSnapshot (dev real-odds bridge)', () => {
  it('loads the slate from a URL and flips the source to live', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => SLATE,
    })) as unknown as typeof fetch
    const dispose = connectSnapshot('/dev-odds.json', 30_000, fetchImpl)
    await flush()
    expect(isLiveOdds()).toBe(true)
    expect(getBookOddsSnapshot().events.map((e) => e.eventId)).toEqual(['real-1'])
    dispose()
  })

  it('keeps the mock slate when the fetch fails', async () => {
    const fetchImpl = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    const dispose = connectSnapshot('/missing.json', 30_000, fetchImpl)
    await flush()
    expect(isLiveOdds()).toBe(false) // still the offline mock
    expect(getBookOddsSnapshot().events.length).toBeGreaterThan(0)
    dispose()
  })
})
