/**
 * De-vig methods — each turns a market's RAW implied probabilities into TRUE probabilities that
 * sum to 1, with no negatives even on a skewed book.
 */
import { describe, it, expect } from 'vitest'
import { impliedProbability } from './pricing.js'
import { devig, DEVIG_METHODS } from './devig.js'

const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0)

describe('devig — recovers true probabilities', () => {
  it('every method maps a balanced -110/-110 to 50/50', () => {
    const implied = [impliedProbability(-110), impliedProbability(-110)]
    for (const method of DEVIG_METHODS) {
      const t = devig(implied, method)
      expect(t[0]).toBeCloseTo(0.5, 6)
      expect(t[1]).toBeCloseTo(0.5, 6)
      expect(sum(t)).toBeCloseTo(1, 9)
    }
  })

  it('a skewed -500/+380 de-vigs with no negative probs; shin == additive on a 2-way', () => {
    const implied = [impliedProbability(-500), impliedProbability(380)]
    for (const method of DEVIG_METHODS) {
      const t = devig(implied, method)
      expect(t.every((p) => p >= 0)).toBe(true)
      expect(sum(t)).toBeCloseTo(1, 9)
    }
    expect(devig(implied, 'shin')).toEqual(devig(implied, 'additive'))
  })

  it('a 3-way market de-vigs to sum = 1 under every method', () => {
    const implied = [impliedProbability(150), impliedProbability(220), impliedProbability(280)]
    for (const method of DEVIG_METHODS) {
      const t = devig(implied, method)
      expect(t).toHaveLength(3)
      expect(t.every((p) => p >= 0)).toBe(true)
      expect(sum(t)).toBeCloseTo(1, 9)
    }
  })

  it('the additive guard clamps a would-be-negative longshot and still sums to 1', () => {
    // implied[2] (0.02) is below the equal overround share → naive additive goes negative.
    const t = devig([0.8, 0.5, 0.02], 'additive')
    expect(t.every((p) => p >= 0)).toBe(true)
    expect(sum(t)).toBeCloseTo(1, 9)
  })

  it('power is the default and recovers the fair line', () => {
    const implied = [impliedProbability(-200), impliedProbability(170)]
    expect(devig(implied)).toEqual(devig(implied, 'power'))
    expect(sum(devig(implied))).toBeCloseTo(1, 9)
  })

  it('degenerate markets: a single selection is certain; empty stays empty', () => {
    expect(devig([0.95], 'power')).toEqual([1])
    expect(devig([], 'multiplicative')).toEqual([])
  })

  it('multiplicative is exactly proportional', () => {
    const implied = [0.6, 0.5] // overround 1.1
    const t = devig(implied, 'multiplicative')
    expect(t[0]).toBeCloseTo(0.6 / 1.1, 9)
    expect(t[1]).toBeCloseTo(0.5 / 1.1, 9)
  })
})
