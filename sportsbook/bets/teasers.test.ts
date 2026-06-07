import { describe, it, expect } from 'vitest'
import {
  teaseLine,
  gradeTeaserLeg,
  teaserDecimal,
  gradeTeaser,
  type TeaserLeg,
  type TeaserResult,
} from './teasers.js'

describe('teaseLine — moves the line in the bettor’s favour', () => {
  it('spread: grows the picked side’s handicap', () => {
    expect(teaseLine('spread', 'home', -3, 6)).toBe(3) // laying 3 → getting 3
    expect(teaseLine('spread', 'away', -7, 6)).toBe(-1)
  })
  it('total: over comes down, under goes up', () => {
    expect(teaseLine('total', 'over', 45, 6)).toBe(39)
    expect(teaseLine('total', 'under', 45, 6)).toBe(51)
  })
  it('rejects non-positive points', () => {
    expect(() => teaseLine('spread', 'home', -3, 0)).toThrow()
  })
})

describe('gradeTeaserLeg', () => {
  it('grades a teased spread', () => {
    // home -3 teased +6 → needs to not lose by 3+. adj = +3
    expect(gradeTeaserLeg('spread', 'home', -3, 6, 24, 20)).toBe('win') // +7
    expect(gradeTeaserLeg('spread', 'home', -3, 6, 20, 24)).toBe('loss') // -1
    expect(gradeTeaserLeg('spread', 'home', -3, 6, 21, 24)).toBe('push') // 0
  })
  it('grades a teased total', () => {
    // over 45 teased → 39
    expect(gradeTeaserLeg('total', 'over', 45, 6, 20, 20)).toBe('win') // 40 > 39
    expect(gradeTeaserLeg('total', 'over', 45, 6, 19, 19)).toBe('loss') // 38 < 39
    // under 45 teased → 51
    expect(gradeTeaserLeg('total', 'under', 45, 6, 24, 24)).toBe('win') // 48 < 51
    expect(gradeTeaserLeg('total', 'under', 45, 6, 30, 30)).toBe('loss') // 60 > 51
  })
})

describe('teaserDecimal', () => {
  it('reads the standard table (football 6pt, 2 legs ≈ −110)', () => {
    expect(teaserDecimal('football', 6, 2)).toBeCloseTo(1 + 100 / 110, 6)
    expect(teaserDecimal('football', 6, 3)).toBeCloseTo(1 + 160 / 100, 6) // +160
  })
  it('throws for an unsupported config', () => {
    expect(() => teaserDecimal('football', 6, 7)).toThrow()
    expect(() => teaserDecimal('basketball', 9, 2)).toThrow()
  })
})

describe('gradeTeaser', () => {
  const spread = (line: number): TeaserLeg => ({ market: 'spread', pick: 'home', line })

  it('wins at the table price when every teased leg wins', () => {
    const legs = [spread(-3), spread(-3)]
    const results: TeaserResult[] = [
      { home: 30, away: 20 },
      { home: 28, away: 24 },
    ]
    const g = gradeTeaser(legs, 6, results, 'football')
    expect(g.outcome).toBe('win')
    expect(g.effectiveLegs).toBe(2)
    expect(g.decimal).toBeCloseTo(teaserDecimal('football', 6, 2), 8)
  })

  it('loses if any leg loses', () => {
    const legs = [spread(-3), spread(-3)]
    const results: TeaserResult[] = [
      { home: 30, away: 20 }, // win
      { home: 18, away: 24 }, // adj +3 → -3 → loss
    ]
    expect(gradeTeaser(legs, 6, results, 'football').outcome).toBe('loss')
  })

  it('a push drops out and the teaser re-prices on the rest', () => {
    const legs = [spread(-3), spread(-3), spread(-3)]
    const results: TeaserResult[] = [
      { home: 21, away: 24 }, // adj +3 → 0 → push
      { home: 30, away: 20 }, // win
      { home: 25, away: 24 }, // win
    ]
    const g = gradeTeaser(legs, 6, results, 'football')
    expect(g.outcome).toBe('win')
    expect(g.effectiveLegs).toBe(2) // 3-team reduced to a 2-team teaser
    expect(g.decimal).toBeCloseTo(teaserDecimal('football', 6, 2), 8)
  })

  it('returns the stake when a 2-team teaser pushes down below 2 legs', () => {
    const legs = [spread(-3), spread(-3)]
    const results: TeaserResult[] = [
      { home: 21, away: 24 }, // push
      { home: 30, away: 20 }, // win
    ]
    const g = gradeTeaser(legs, 6, results, 'football')
    expect(g.outcome).toBe('push')
    expect(g.decimal).toBe(1)
  })

  it('honours the ties-lose push rule', () => {
    const legs = [spread(-3), spread(-3)]
    const results: TeaserResult[] = [
      { home: 21, away: 24 }, // push
      { home: 30, away: 20 }, // win
    ]
    expect(gradeTeaser(legs, 6, results, 'football', 'loss').outcome).toBe('loss')
  })
})
