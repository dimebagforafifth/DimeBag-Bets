import { describe, expect, it } from 'vitest'
import { clvSummary } from './clv.js'
import type { ClvDatum } from './types.js'

const datum = (betDecimal: number, closeFairProb: number): ClvDatum => ({
  accountId: 'p',
  betDecimal,
  closeFairProb,
  time: 0,
})

describe('clvSummary', () => {
  it('is GATED honest when no closing-line data exists (never faked)', () => {
    const c = clvSummary([])
    expect(c.available).toBe(false)
    expect(c.sampleSize).toBe(0)
    expect(c.beatRate).toBe(0)
    expect(c.note).toMatch(/closing-line/i)
  })

  it('computes beat rate (clv > 0) and average CLV percent', () => {
    // 2.00 decimal: clv = closeFairProb*2 - 1. 0.55 → +0.10 (beat); 0.45 → -0.10 (miss).
    const c = clvSummary([datum(2, 0.55), datum(2, 0.45)])
    expect(c.available).toBe(true)
    expect(c.sampleSize).toBe(2)
    expect(c.beatRate).toBe(50)
    expect(c.avgClvPct).toBeCloseTo(0) // (+10% + −10%) / 2
  })

  it('reports a fully-beaten book as 100% beat rate with positive average', () => {
    const c = clvSummary([datum(2, 0.55), datum(2, 0.6)])
    expect(c.beatRate).toBe(100)
    expect(c.avgClvPct).toBeGreaterThan(0)
  })
})
