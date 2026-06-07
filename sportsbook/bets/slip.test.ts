import { describe, it, expect } from 'vitest'
import {
  emptySlip,
  addSelection,
  removeSelection,
  toggleSelection,
  relatedPairs,
  canCombine,
  teaserEligible,
  availableBetTypes,
  priceSingles,
  priceParlay,
  priceRoundRobin,
  priceTeaser,
  type SlipSelection,
} from './slip.js'

const ml = (id: string, eventId: string, decimal: number): SlipSelection => ({
  id,
  eventId,
  label: id,
  market: 'moneyline',
  decimal,
})
const spread = (id: string, eventId: string, decimal: number, line: number): SlipSelection => ({
  id,
  eventId,
  label: id,
  market: 'spread',
  pick: 'home',
  line,
  decimal,
  sport: 'football',
})

describe('slip mutations are immutable', () => {
  it('add / remove / toggle return new slips', () => {
    const s0 = emptySlip()
    const s1 = addSelection(s0, ml('a', 'g1', 2))
    expect(s0.selections).toHaveLength(0) // unchanged
    expect(s1.selections).toHaveLength(1)
    const s2 = removeSelection(s1, 'a')
    expect(s2.selections).toHaveLength(0)
    expect(toggleSelection(s1, ml('a', 'g1', 2)).selections).toHaveLength(0) // present → removed
    expect(toggleSelection(s1, ml('b', 'g2', 2)).selections).toHaveLength(2) // absent → added
  })

  it('re-adding the same id refreshes the price, not duplicates', () => {
    let s = addSelection(emptySlip(), ml('a', 'g1', 2))
    s = addSelection(s, ml('a', 'g1', 2.5))
    expect(s.selections).toHaveLength(1)
    expect(s.selections[0].decimal).toBe(2.5)
  })
})

describe('conflict detection', () => {
  it('flags two legs from the same event as related', () => {
    let s = addSelection(emptySlip(), ml('a', 'g1', 2))
    s = addSelection(s, spread('b', 'g1', 1.9, -3)) // same event g1
    expect(relatedPairs(s)).toEqual([['a', 'b']])
    expect(canCombine(s)).toBe(false)
  })
  it('different events can combine', () => {
    let s = addSelection(emptySlip(), ml('a', 'g1', 2))
    s = addSelection(s, ml('b', 'g2', 2))
    expect(canCombine(s)).toBe(true)
  })
})

describe('availableBetTypes', () => {
  it('one leg → single only', () => {
    const s = addSelection(emptySlip(), ml('a', 'g1', 2))
    expect(availableBetTypes(s)).toEqual(['single'])
  })
  it('two unrelated moneylines → single + parlay (no teaser, not spreads)', () => {
    let s = addSelection(emptySlip(), ml('a', 'g1', 2))
    s = addSelection(s, ml('b', 'g2', 2))
    expect(availableBetTypes(s)).toEqual(['single', 'parlay'])
  })
  it('three unrelated spreads → single, parlay, round robin, teaser', () => {
    let s = addSelection(emptySlip(), spread('a', 'g1', 1.9, -3))
    s = addSelection(s, spread('b', 'g2', 1.9, -6))
    s = addSelection(s, spread('c', 'g3', 1.9, 2.5))
    expect(availableBetTypes(s)).toEqual(['single', 'parlay', 'roundRobin', 'teaser'])
    expect(teaserEligible(s)).toBe(true)
  })
  it('related legs cannot parlay/teaser', () => {
    let s = addSelection(emptySlip(), spread('a', 'g1', 1.9, -3))
    s = addSelection(s, spread('b', 'g1', 1.9, 3)) // same event
    expect(availableBetTypes(s)).toEqual(['single'])
  })
})

describe('pricing', () => {
  const threeSpreads = () => {
    let s = addSelection(emptySlip(), spread('a', 'g1', 2, -3))
    s = addSelection(s, spread('b', 'g2', 2, -6))
    s = addSelection(s, spread('c', 'g3', 2, 2.5))
    return s
  }

  it('singles', () => {
    const p = priceSingles(threeSpreads(), 10)
    expect(p.tickets).toHaveLength(3)
    expect(p.totalStake).toBe(30)
    expect(p.maxReturn).toBe(60) // 3 × 20
  })

  it('parlay (2.0 × 2.0 × 2.0 = 8.0)', () => {
    const p = priceParlay(threeSpreads(), 10)
    expect(p.decimal).toBeCloseTo(8, 10)
    expect(p.toReturn).toBe(80)
    expect(p.legs).toEqual(['a', 'b', 'c'])
  })

  it('round robin by 2s → 3 parlays', () => {
    const rr = priceRoundRobin(threeSpreads(), [2], 10)
    expect(rr.parlayCount).toBe(3)
    expect(rr.totalStake).toBe(30)
  })

  it('teaser previews the teased lines and prices off the table', () => {
    const t = priceTeaser(threeSpreads(), 6, 10)
    expect(t.legs[0]).toMatchObject({ label: 'a', originalLine: -3, teasedLine: 3 })
    expect(t.decimal).toBeCloseTo(1 + 160 / 100, 6) // football 6pt, 3 legs = +160
  })

  it('refuses to combine related legs', () => {
    let s = addSelection(emptySlip(), spread('a', 'g1', 2, -3))
    s = addSelection(s, spread('b', 'g1', 2, 3))
    expect(() => priceParlay(s, 10)).toThrow(/related/)
  })
})
