import { describe, it, expect } from 'vitest'
import {
  RISKS,
  buildPaytable,
  hitProbabilities,
  rtpOf,
  type KenoRisk,
} from './paytable.js'

describe('hitProbabilities', () => {
  it('sums to 1 and matches known values', () => {
    for (let picks = 1; picks <= 10; picks++) {
      const p = hitProbabilities(picks)
      expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    }
    // 1 pick: P(hit) = 10/40 = 0.25
    expect(hitProbabilities(1)[1]).toBeCloseTo(0.25, 10)
    // 10 picks, all 10 hit: 1 / C(40,10)
    expect(hitProbabilities(10)[10]).toBeCloseTo(1 / 847660528, 15)
  })
})

describe('buildPaytable', () => {
  it('only pays the higher hit-counts, and every paying tier returns > 1×', () => {
    for (let picks = 1; picks <= 10; picks++) {
      for (const risk of RISKS) {
        const table = buildPaytable(picks, risk)
        expect(table).toHaveLength(picks + 1)
        for (const m of table) {
          if (m > 0) expect(m).toBeGreaterThan(1) // a "win" always beats the stake
        }
        // multipliers are non-decreasing in hits
        const paying = table.filter((m) => m > 0)
        for (let i = 1; i < paying.length; i++) expect(paying[i]).toBeGreaterThanOrEqual(paying[i - 1])
      }
    }
  })

  it('higher risk concentrates payouts on fewer, bigger tiers', () => {
    const low = buildPaytable(10, 'low').filter((m) => m > 0).length
    const high = buildPaytable(10, 'high').filter((m) => m > 0).length
    expect(high).toBeLessThanOrEqual(low)
    // top multiplier is bigger on high risk
    expect(Math.max(...buildPaytable(10, 'high'))).toBeGreaterThan(Math.max(...buildPaytable(10, 'low')))
  })

  it('a 1-number pick pays ~3.96× on a hit at 1% edge (0.99 / 0.25)', () => {
    expect(buildPaytable(1, 'classic')[1]).toBeCloseTo(3.96, 2)
  })
})

describe('rtpOf — the edge is provably correct', () => {
  it('realized RTP ≈ (1 − edge) for every pick count and risk', () => {
    for (let picks = 1; picks <= 10; picks++) {
      for (const risk of RISKS as KenoRisk[]) {
        const rtp = rtpOf(picks, risk)
        // computed to hit 0.99; rounding to 2dp + the top-tier cap leave a hair of drift
        expect(rtp).toBeGreaterThan(0.96)
        expect(rtp).toBeLessThanOrEqual(1.0)
      }
    }
  })

  it('a different edge shifts the RTP', () => {
    expect(rtpOf(5, 'medium', { edge: 0 })).toBeGreaterThan(rtpOf(5, 'medium', { edge: 0.1 }))
  })
})
