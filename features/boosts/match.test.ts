/**
 * Slip qualification (pure). A qualifier ANDs its set fields over the slip's legs/mode/decimal;
 * sport/market filters require EVERY leg to match; bestOddsBoost picks the richest odds boost.
 */

import { describe, expect, it } from 'vitest'
import type { SlipLeg, SlipMode } from '../../app/book/slip.js'
import { bestOddsBoost, matchesQualifier, qualifyingBoosts, type QualifyingSlip } from './match.js'
import type { BoostDef } from './types.js'

function leg(over: Partial<SlipLeg> = {}): SlipLeg {
  return {
    key: 'k',
    eventId: 'e1',
    eventLabel: 'A @ B',
    leagueId: 'l',
    marketId: 'e1:moneyline:game',
    marketType: 'moneyline',
    marketPeriod: 'game',
    side: 'home',
    pick: 'Home',
    price: { american: -110, decimal: 1.91 },
    sport: 'BASKETBALL',
    ...over,
  }
}

function slip(legs: SlipLeg[], mode: SlipMode = 'parlay', decimal = 3.0): QualifyingSlip {
  return { legs, mode, decimal }
}

function boost(over: Partial<BoostDef> = {}): BoostDef {
  return {
    id: 'b',
    name: 'B',
    enabled: true,
    boostType: 'odds',
    pct: 20,
    maxWinCents: null,
    playthroughX: 1,
    expiryMs: 1,
    eligibility: {},
    qualifier: {},
    ...over,
  }
}

describe('matchesQualifier', () => {
  it('an empty qualifier matches any non-empty sportsbook slip', () => {
    expect(matchesQualifier({}, slip([leg()]))).toBe(true)
    expect(matchesQualifier({}, slip([]))).toBe(false)
  })
  it('minLegs requires at least N legs', () => {
    expect(matchesQualifier({ minLegs: 2 }, slip([leg()]))).toBe(false)
    expect(matchesQualifier({ minLegs: 2 }, slip([leg(), leg({ key: 'k2' })]))).toBe(true)
  })
  it('sgpOnly requires a same-game parlay', () => {
    const same = slip([leg(), leg({ key: 'k2' })], 'parlay')
    const cross = slip([leg(), leg({ key: 'k2', eventId: 'e2' })], 'parlay')
    expect(matchesQualifier({ sgpOnly: true }, same)).toBe(true)
    expect(matchesQualifier({ sgpOnly: true }, cross)).toBe(false)
  })
  it('sports must match EVERY leg', () => {
    const mixed = slip([leg(), leg({ key: 'k2', sport: 'FOOTBALL' })])
    expect(matchesQualifier({ sports: ['BASKETBALL'] }, slip([leg()]))).toBe(true)
    expect(matchesQualifier({ sports: ['BASKETBALL'] }, mixed)).toBe(false)
  })
  it('marketTypes must match EVERY leg', () => {
    const mixed = slip([leg(), leg({ key: 'k2', marketType: 'spread' })])
    expect(matchesQualifier({ marketTypes: ['moneyline'] }, mixed)).toBe(false)
  })
  it('decimal floor/ceiling bound the combined price', () => {
    expect(matchesQualifier({ minDecimal: 3.5 }, slip([leg()], 'parlay', 3.0))).toBe(false)
    expect(matchesQualifier({ maxDecimal: 2.5 }, slip([leg()], 'parlay', 3.0))).toBe(false)
    expect(
      matchesQualifier({ minDecimal: 2.5, maxDecimal: 3.5 }, slip([leg()], 'parlay', 3.0)),
    ).toBe(true)
  })
})

describe('qualifyingBoosts / bestOddsBoost', () => {
  const defs = [
    boost({ id: 'odds-lo', boostType: 'odds', pct: 10, qualifier: { sports: ['BASKETBALL'] } }),
    boost({ id: 'odds-hi', boostType: 'odds', pct: 30, qualifier: { sports: ['BASKETBALL'] } }),
    boost({ id: 'profit', boostType: 'profit', pct: 50, qualifier: { sports: ['BASKETBALL'] } }),
    boost({ id: 'off', enabled: false, pct: 99, qualifier: { sports: ['BASKETBALL'] } }),
    boost({ id: 'football', boostType: 'odds', pct: 99, qualifier: { sports: ['FOOTBALL'] } }),
  ]
  it('returns only enabled, matching boosts', () => {
    const ids = qualifyingBoosts(slip([leg()]), defs).map((d) => d.id)
    expect(ids.sort()).toEqual(['odds-hi', 'odds-lo', 'profit'])
  })
  it('bestOddsBoost picks the highest-pct ODDS boost', () => {
    expect(bestOddsBoost(slip([leg()]), defs)?.id).toBe('odds-hi')
  })
  it('bestOddsBoost is null when no odds boost qualifies', () => {
    const profitOnly = [boost({ id: 'p', boostType: 'profit', qualifier: {} })]
    expect(bestOddsBoost(slip([leg()]), profitOnly)).toBeNull()
  })
})
