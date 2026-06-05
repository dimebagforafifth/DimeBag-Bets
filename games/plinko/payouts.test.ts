import { describe, it, expect } from 'vitest'
import {
  MAX_ROWS,
  MIN_ROWS,
  RISKS,
  payouts,
  rtpOf,
  slotProbabilities,
  type PlinkoRisk,
} from './payouts.js'

const ALL_ROWS = Array.from({ length: MAX_ROWS - MIN_ROWS + 1 }, (_, i) => MIN_ROWS + i)

describe('payouts', () => {
  it('has a symmetric table of length rows+1 for every rows × risk', () => {
    for (const rows of ALL_ROWS) {
      for (const risk of RISKS) {
        const t = payouts(rows, risk)
        expect(t).toHaveLength(rows + 1)
        for (let i = 0; i <= rows; i++) expect(t[i]).toBe(t[rows - i]) // mirror
        expect(t.every((m) => m > 0)).toBe(true)
      }
    }
  })

  it('edges pay the most, the center the least (high risk is most extreme)', () => {
    for (const rows of ALL_ROWS) {
      for (const risk of RISKS) {
        const t = payouts(rows, risk)
        const center = t[Math.floor(rows / 2)]
        expect(t[0]).toBeGreaterThan(center)
      }
    }
    // 16-row high tops out at Stake's headline 1000×
    expect(Math.max(...payouts(16, 'high'))).toBe(1000)
    expect(Math.max(...payouts(16, 'high'))).toBeGreaterThan(Math.max(...payouts(16, 'low')))
  })

  it('matches Stake’s published 8-row tables exactly', () => {
    expect(payouts(8, 'low')).toEqual([5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6])
    expect(payouts(8, 'medium')).toEqual([13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13])
    expect(payouts(8, 'high')).toEqual([29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29])
  })

  it('rejects out-of-range row counts', () => {
    expect(() => payouts(7, 'low')).toThrow(/rows must be/)
    expect(() => payouts(17, 'low')).toThrow(/rows must be/)
  })
})

describe('slotProbabilities', () => {
  it('is the binomial C(rows,i)/2^rows and sums to 1', () => {
    for (const rows of ALL_ROWS) {
      const p = slotProbabilities(rows)
      expect(p).toHaveLength(rows + 1)
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
      expect(p[0]).toBeCloseTo(1 / 2 ** rows, 15) // a single far edge
    }
    // 16 rows: a far edge is 1 in 65,536; the center is the most likely slot
    expect(slotProbabilities(16)[0]).toBeCloseTo(1 / 65536, 15)
    const p16 = slotProbabilities(16)
    expect(Math.max(...p16)).toBe(p16[8])
  })
})

describe('rtpOf — the edge is whatever Stake’s table yields, shown honestly', () => {
  it('every table lands in a sane ~96–99.5% RTP band', () => {
    for (const rows of ALL_ROWS) {
      for (const risk of RISKS as PlinkoRisk[]) {
        const rtp = rtpOf(rows, risk)
        expect(rtp).toBeGreaterThan(0.95)
        expect(rtp).toBeLessThan(1.0)
      }
    }
  })
})
