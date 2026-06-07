import { describe, it, expect } from 'vitest'
import {
  RISKS,
  SEGMENT_OPTIONS,
  buildWheel,
  legend,
  rtpOf,
  type WheelRisk,
} from './payouts.js'

describe('buildWheel', () => {
  it('produces a table of length `segments` for every risk × segment count', () => {
    for (const segments of SEGMENT_OPTIONS) {
      for (const risk of RISKS) {
        const t = buildWheel(risk, segments)
        expect(t).toHaveLength(segments)
        expect(t.every((m) => m >= 0)).toBe(true)
        // every non-zero pocket pays strictly more than the stake
        expect(t.filter((m) => m > 0).every((m) => m > 1)).toBe(true)
      }
    }
  })

  it('high risk is one jackpot pocket = ~(1−edge)×segments with the rest 0×', () => {
    for (const segments of SEGMENT_OPTIONS) {
      const t = buildWheel('high', segments)
      const winners = t.filter((m) => m > 0)
      expect(winners).toHaveLength(1)
      expect(winners[0]).toBeCloseTo(0.99 * segments, 2)
    }
    // 50-segment high tops out near Stake's headline 49.5×
    expect(Math.max(...buildWheel('high', 50))).toBeCloseTo(49.5, 2)
  })

  it('low risk has more winning pockets than high, and high pays the biggest', () => {
    const lowWinners = buildWheel('low', 20).filter((m) => m > 0).length
    const highWinners = buildWheel('high', 20).filter((m) => m > 0).length
    expect(lowWinners).toBeGreaterThan(highWinners)
    expect(Math.max(...buildWheel('high', 20))).toBeGreaterThan(Math.max(...buildWheel('low', 20)))
  })

  it('rejects invalid segment counts', () => {
    expect(() => buildWheel('low', 15)).toThrow(/segments must be/)
  })
})

describe('rtpOf — the edge is provably correct', () => {
  it('every table means ≈ (1 − edge)', () => {
    for (const segments of SEGMENT_OPTIONS) {
      for (const risk of RISKS as WheelRisk[]) {
        expect(rtpOf(risk, segments)).toBeGreaterThan(0.97)
        expect(rtpOf(risk, segments)).toBeLessThanOrEqual(1.0)
      }
    }
    // a different edge shifts the mean
    expect(rtpOf('medium', 20, { edge: 0 })).toBeGreaterThan(rtpOf('medium', 20, { edge: 0.1 }))
  })
})

describe('legend', () => {
  it('lists distinct multipliers with counts that sum to the segment count', () => {
    const t = buildWheel('medium', 30)
    const l = legend(t)
    expect(l.reduce((a, b) => a + b.count, 0)).toBe(30)
    // sorted ascending, includes the 0× pockets
    expect(l[0].multiplier).toBe(0)
    for (let i = 1; i < l.length; i++) expect(l[i].multiplier).toBeGreaterThan(l[i - 1].multiplier)
  })
})
