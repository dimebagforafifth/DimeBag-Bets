import { describe, it, expect } from 'vitest'
import {
  combinations,
  parlayDecimalOf,
  roundRobin,
  roundRobinParlayCount,
  type RoundRobinLeg,
} from './roundrobin.js'

describe('combinations', () => {
  it('lists every k-subset in lexicographic order', () => {
    expect(combinations(3, 2)).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ])
    expect(combinations(4, 2)).toHaveLength(6)
    expect(combinations(4, 1)).toEqual([[0], [1], [2], [3]])
    expect(combinations(4, 4)).toEqual([[0, 1, 2, 3]])
    expect(combinations(4, 0)).toEqual([[]])
  })

  it('rejects invalid n/k', () => {
    expect(() => combinations(3, 4)).toThrow()
    expect(() => combinations(3, -1)).toThrow()
  })
})

describe('parlayDecimalOf', () => {
  it('is the product of leg decimals', () => {
    expect(parlayDecimalOf([2, 2])).toBeCloseTo(4, 10)
    expect(parlayDecimalOf([1.5, 2, 3])).toBeCloseTo(9, 10)
  })

  it('caps at the max payout (300)', () => {
    expect(parlayDecimalOf(Array(9).fill(2))).toBe(300) // 2^9 = 512 → capped
  })

  it('rejects a leg ≤ 1', () => {
    expect(() => parlayDecimalOf([2, 1])).toThrow()
  })
})

describe('roundRobin', () => {
  const legs: RoundRobinLeg[] = [
    { label: 'A', decimal: 2 },
    { label: 'B', decimal: 2 },
    { label: 'C', decimal: 2 },
    { label: 'D', decimal: 2 },
  ]

  it('bets every 2-leg combination at the per-parlay stake', () => {
    const rr = roundRobin(legs, [2], 10)
    expect(rr.parlayCount).toBe(6) // C(4,2)
    expect(rr.totalStake).toBe(60) // 6 × 10
    expect(rr.parlays[0]).toMatchObject({ legs: ['A', 'B'], decimal: 4, stake: 10, toReturn: 40 })
    expect(rr.maxReturn).toBe(240) // 6 × 40 if all win
    expect(rr.bestParlayReturn).toBe(40)
  })

  it('supports multiple sizes (by 2s and 3s)', () => {
    const rr = roundRobin(legs, [2, 3], 5)
    expect(rr.parlayCount).toBe(10) // C(4,2)+C(4,3) = 6 + 4
    expect(roundRobinParlayCount(4, [2, 3])).toBe(10)
  })

  it('rejects bad inputs', () => {
    expect(() => roundRobin([legs[0]], [2], 10)).toThrow(/≥2 legs/)
    expect(() => roundRobin(legs, [1], 10)).toThrow(/size/)
    expect(() => roundRobin(legs, [2], 0)).toThrow(/positive integer/)
  })
})
