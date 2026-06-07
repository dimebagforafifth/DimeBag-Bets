import { describe, it, expect } from 'vitest'
import { overProbability, priceLine, altLineLadder, gradeOverUnder } from './lines.js'
import { pricedOverround } from '../trading/pricing.js'

describe('overProbability', () => {
  it('is 50% at the mean', () => {
    expect(overProbability(220, 17, 220)).toBeCloseTo(0.5, 6)
  })
  it('falls as the line rises above the mean', () => {
    const a = overProbability(220, 17, 225)
    const b = overProbability(220, 17, 230)
    expect(a).toBeLessThan(0.5)
    expect(b).toBeLessThan(a)
  })
  it('matches a z-score by hand (line 1 sd above mean → ~15.9% over)', () => {
    expect(overProbability(100, 10, 110)).toBeCloseTo(0.1586553, 4)
  })
})

describe('priceLine', () => {
  it('prices a pick-em line as two near-even sides carrying the margin', () => {
    const pl = priceLine(220, 17, 220, 0.05)
    expect(pl.pOver).toBeCloseTo(0.5, 6)
    expect(pl.over.decimal).toBeCloseTo(pl.under.decimal, 6) // symmetric
    expect(pricedOverround([pl.over, pl.under])).toBeCloseTo(1.05, 6)
  })

  it('makes the over the longer price when the line is above the mean', () => {
    const pl = priceLine(220, 17, 230, 0.05)
    expect(pl.over.decimal).toBeGreaterThan(pl.under.decimal) // over less likely → longer
  })

  it('rejects a non-positive sd', () => {
    expect(() => priceLine(220, 0, 220)).toThrow()
  })
})

describe('altLineLadder', () => {
  it('prices each rung; the over lengthens as the line climbs', () => {
    const ladder = altLineLadder(220, 17, [230, 210, 220, 225, 215], 0.05) // unsorted input
    expect(ladder.map((l) => l.line)).toEqual([210, 215, 220, 225, 230]) // sorted
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].pOver).toBeLessThan(ladder[i - 1].pOver) // over gets less likely
      expect(ladder[i].over.decimal).toBeGreaterThan(ladder[i - 1].over.decimal) // → longer
    }
  })
})

describe('gradeOverUnder', () => {
  it('grades over/under and pushes on an exact whole-number landing', () => {
    expect(gradeOverUnder(27.5, 'over', 30)).toBe('win')
    expect(gradeOverUnder(27.5, 'over', 25)).toBe('loss')
    expect(gradeOverUnder(27.5, 'under', 25)).toBe('win')
    expect(gradeOverUnder(27, 'over', 27)).toBe('push') // exact landing
    expect(gradeOverUnder(27, 'under', 27)).toBe('push')
  })
})
