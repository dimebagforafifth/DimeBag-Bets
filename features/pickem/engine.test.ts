/**
 * Grading: power is all-or-nothing, flex pays a miss-one tier, voids drop a leg and re-grade
 * at the lower count, and the whole entry voids if too few legs survive. Plus the
 * contradictory-pick guard. Pure — settlement-through-core is tested in entries.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { gradeEntry, hasContradiction, pickIdentity, type PickResult } from './engine.js'

const picks = (...sides: ('higher' | 'lower')[]) => sides.map((side, i) => ({ id: `p${i}`, side }))
const results = (...rs: PickResult[]): Record<string, PickResult> =>
  Object.fromEntries(rs.map((r, i) => [`p${i}`, r]))

describe('gradeEntry — POWER', () => {
  it('pays the full multiple when every leg hits', () => {
    const g = gradeEntry(
      'power',
      picks('higher', 'lower', 'higher', 'higher'),
      results('higher', 'lower', 'higher', 'higher'),
    )
    expect(g.correct).toBe(4)
    expect(g.effectivePicks).toBe(4)
    expect(g.multiplier).toBe(10)
    expect(g.status).toBe('won')
  })

  it('loses everything on a single miss', () => {
    const g = gradeEntry(
      'power',
      picks('higher', 'higher', 'higher'),
      results('higher', 'lower', 'higher'),
    )
    expect(g.correct).toBe(2)
    expect(g.multiplier).toBe(0)
    expect(g.status).toBe('lost')
  })
})

describe('gradeEntry — FLEX', () => {
  it('pays a reduced multiple when one leg misses', () => {
    const g = gradeEntry(
      'flex',
      picks('higher', 'higher', 'higher', 'higher'),
      results('higher', 'higher', 'higher', 'lower'),
    )
    expect(g.correct).toBe(3)
    expect(g.multiplier).toBe(1.5) // 4-pick flex, 3 correct
    expect(g.status).toBe('won')
  })

  it('a sub-1 consolation tier is a net loss but returns part of the stake', () => {
    const g = gradeEntry(
      'flex',
      picks('higher', 'higher', 'higher', 'higher', 'higher'),
      results('higher', 'higher', 'higher', 'lower', 'lower'),
    )
    expect(g.correct).toBe(3)
    expect(g.multiplier).toBe(0.4) // 5-pick flex, 3 correct
    expect(g.status).toBe('lost')
  })

  it('below the lowest tier pays nothing', () => {
    const g = gradeEntry(
      'flex',
      picks('higher', 'higher', 'higher'),
      results('higher', 'lower', 'lower'),
    )
    expect(g.correct).toBe(1)
    expect(g.multiplier).toBe(0)
    expect(g.status).toBe('lost')
  })
})

describe('gradeEntry — voids drop out (parlay-style)', () => {
  it('a void leg drops and the entry re-grades at the lower POWER count', () => {
    // 4-pick power, one void → plays as a 3-pick power; remaining 3 all hit → pays 5x
    const g = gradeEntry(
      'power',
      picks('higher', 'higher', 'higher', 'higher'),
      results('higher', 'higher', 'higher', 'void'),
    )
    expect(g.effectivePicks).toBe(3)
    expect(g.correct).toBe(3)
    expect(g.multiplier).toBe(5)
    expect(g.status).toBe('won')
  })

  it('FLEX degrades to POWER when voids drop it below the flex minimum', () => {
    // 3-pick flex, one void → 2 legs left → plays as a 2-pick POWER; both hit → 3x
    const g = gradeEntry(
      'flex',
      picks('higher', 'higher', 'higher'),
      results('higher', 'higher', 'void'),
    )
    expect(g.effectivePicks).toBe(2)
    expect(g.mode).toBe('power')
    expect(g.multiplier).toBe(3)
  })

  it('voids the whole entry (stake returned) when too few legs survive', () => {
    const g = gradeEntry(
      'power',
      picks('higher', 'higher', 'higher'),
      results('higher', 'void', 'void'),
    )
    expect(g.effectivePicks).toBe(1)
    expect(g.multiplier).toBe(1)
    expect(g.status).toBe('void')
  })

  it('treats an ungraded (missing) leg as a void', () => {
    const g = gradeEntry('power', picks('higher', 'higher'), { p0: 'higher' }) // p1 ungraded
    expect(g.effectivePicks).toBe(1)
    expect(g.status).toBe('void')
  })

  it('a voided entry reports the degraded mode (flex→power) for contract consistency', () => {
    const g = gradeEntry(
      'flex',
      picks('higher', 'higher', 'higher'),
      results('higher', 'void', 'void'),
    )
    expect(g.status).toBe('void')
    expect(g.mode).toBe('power') // only 1 leg survived → below the flex minimum
  })
})

describe('contradiction guard', () => {
  it('flags two picks on the same player+stat (opposite sides or duplicate)', () => {
    expect(
      hasContradiction([
        { playerId: 'L. James', statId: 'points' },
        { playerId: 'L. James', statId: 'points' },
      ]),
    ).toBe(true)
  })
  it('allows different stats for the same player and same stat for different players', () => {
    expect(
      hasContradiction([
        { playerId: 'L. James', statId: 'points' },
        { playerId: 'L. James', statId: 'rebounds' },
        { playerId: 'J. Tatum', statId: 'points' },
      ]),
    ).toBe(false)
  })
  it('pickIdentity keys by player+stat', () => {
    expect(pickIdentity({ playerId: 'L. James', statId: 'points' })).toBe('L. James::points')
  })
})
