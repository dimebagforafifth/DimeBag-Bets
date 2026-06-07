import { describe, it, expect } from 'vitest'
import { liveAmerican, liveDecimal, liveSelections, liveWinProb } from './live.js'
import { decimalFromAmerican, impliedProbability } from './odds.js'
import { EVENTS, type GameEvent, type Selection } from './markets.js'

const homeML: Selection = {
  id: 's',
  eventId: 'e',
  market: 'moneyline',
  pick: 'home',
  label: 'Home',
  odds: -110,
}

function event(over: Partial<GameEvent>): GameEvent {
  return { id: 'e', sport: 'S', league: 'X', home: 'H', away: 'A', startsAt: 't', selections: [], status: 'upcoming', ...over }
}

describe('liveWinProb', () => {
  it('is the opening implied probability before kickoff', () => {
    expect(liveWinProb(homeML, event({ status: 'upcoming' }))).toBeCloseTo(impliedProbability(-110), 5)
  })

  it('reflects a finished result', () => {
    expect(liveWinProb(homeML, event({ status: 'final', score: { home: 3, away: 1 } }))).toBeGreaterThan(0.9)
    expect(liveWinProb(homeML, event({ status: 'final', score: { home: 1, away: 3 } }))).toBeLessThan(0.1)
  })

  it('rises with a lead and is near-certain late', () => {
    const earlyLead = liveWinProb(homeML, event({ status: 'live', score: { home: 10, away: 4 }, progress: 0.2 }))
    const lateLead = liveWinProb(homeML, event({ status: 'live', score: { home: 10, away: 4 }, progress: 0.95 }))
    expect(lateLead).toBeGreaterThan(earlyLead)
    expect(lateLead).toBeGreaterThan(0.85)
  })

  it('falls when trailing late', () => {
    const p = liveWinProb(homeML, event({ status: 'live', score: { home: 4, away: 10 }, progress: 0.95 }))
    expect(p).toBeLessThan(0.15)
  })

  it('stays within (0,1)', () => {
    for (const r of [0, 0.5, 1]) {
      const p = liveWinProb(homeML, event({ status: 'live', score: { home: 50, away: 0 }, progress: r }))
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThan(1)
    }
  })
})

describe('live odds & markets', () => {
  const liveEvent = (over: Partial<GameEvent>): GameEvent => {
    const base = EVENTS.find((e) => e.id === 'nba-lal-bos')!
    return { ...base, status: 'live', score: { home: 20, away: 12 }, progress: 0.3, ...over }
  }

  it('quotes a valid, vig-shortened American price', () => {
    const e = liveEvent({})
    const home = liveSelections(e).find((s) => s.pick === 'home')!
    const dec = liveDecimal(home, e)
    expect(dec).toBeGreaterThan(1)
    // the live price is shorter than the fair price (margin baked in)
    expect(dec).toBeLessThan(1 / liveWinProb(home, e) + 1e-9)
    expect(americanIsValid(liveAmerican(home, e))).toBe(true)
  })

  it('makes the team pulling ahead the favourite (negative price)', () => {
    const e = liveEvent({ score: { home: 40, away: 10 }, progress: 0.85 })
    const home = liveSelections(e).find((s) => s.pick === 'home')!
    expect(liveAmerican(home, e)).toBeLessThan(0)
  })

  it('offers the full live market set (ML/spread/total) only while live', () => {
    const live = liveSelections(liveEvent({}))
    expect(live.length).toBe(6) // moneyline + spread + total, both sides
    expect(liveSelections(liveEvent({ status: 'upcoming', score: undefined })).length).toBe(0)
    expect(live.every((s) => s.live)).toBe(true)
    expect(new Set(live.map((s) => s.market))).toEqual(new Set(['moneyline', 'spread', 'total']))
    // every quoted price is a valid decimal, and lines are carried through
    expect(live.every((s) => decimalFromAmerican(s.odds) > 1)).toBe(true)
    expect(live.find((s) => s.market === 'spread')?.line).toBeDefined()
  })
})

function americanIsValid(a: number): boolean {
  return Number.isFinite(a) && a !== 0
}
