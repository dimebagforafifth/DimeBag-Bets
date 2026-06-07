import { describe, it, expect } from 'vitest'
import {
  FUTURES,
  futureDecimal,
  futureOverround,
  gradeFuture,
  futurePayoutMultiplier,
  type FutureMarket,
} from './futures.js'

const market: FutureMarket = {
  id: 'test-champ',
  name: 'Test Championship',
  league: 'TEST',
  status: 'open',
  outcomes: [
    { id: 'a', label: 'Team A', american: 200 }, // decimal 3.0
    { id: 'b', label: 'Team B', american: 300 }, // decimal 4.0
    { id: 'c', label: 'Team C', american: 400 }, // decimal 5.0
  ],
}

describe('futureDecimal', () => {
  it('converts the american price', () => {
    expect(futureDecimal(market.outcomes[0])).toBeCloseTo(3, 10) // +200
    expect(futureDecimal(market.outcomes[1])).toBeCloseTo(4, 10) // +300
  })
})

describe('futureOverround', () => {
  it('sums implied probabilities — futures run a fat book (> 1)', () => {
    // 1/3 + 1/4 + 1/5 = 0.7833 here (illustrative market under-round); real slate > 1
    expect(futureOverround(market)).toBeCloseTo(1 / 3 + 1 / 4 + 1 / 5, 8)
    expect(futureOverround(FUTURES[0])).toBeGreaterThan(1) // the shipped NBA slate has vig
  })
})

describe('gradeFuture', () => {
  it('voids until the market settles', () => {
    expect(gradeFuture(market, 'a')).toBe('void')
  })

  it('grades win/loss once settled', () => {
    const settled: FutureMarket = { ...market, status: 'settled', winnerId: 'b' }
    expect(gradeFuture(settled, 'b')).toBe('win')
    expect(gradeFuture(settled, 'a')).toBe('loss')
    expect(gradeFuture(settled, 'c')).toBe('loss')
  })

  it('throws on an unknown outcome', () => {
    expect(() => gradeFuture(market, 'zzz')).toThrow(/unknown outcome/)
  })
})

describe('futurePayoutMultiplier', () => {
  it('pays the decimal on a win, 1 on a void, 0 on a loss', () => {
    const settled: FutureMarket = { ...market, status: 'settled', winnerId: 'b' }
    expect(futurePayoutMultiplier(settled, 'b')).toBeCloseTo(4, 10)
    expect(futurePayoutMultiplier(settled, 'a')).toBe(0)
    expect(futurePayoutMultiplier(market, 'a')).toBe(1) // still open → void → stake back
  })
})

describe('shipped slate', () => {
  it('every market has a field entry and valid prices', () => {
    for (const m of FUTURES) {
      expect(m.outcomes.length).toBeGreaterThanOrEqual(2)
      expect(m.outcomes.some((o) => o.id === 'field')).toBe(true)
      for (const o of m.outcomes) expect(futureDecimal(o)).toBeGreaterThan(1)
    }
  })
})
