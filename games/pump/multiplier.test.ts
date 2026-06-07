import { describe, it, expect } from 'vitest'
import {
  CELLS,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  HOUSE_EDGE,
  maxPumps,
  nextSurviveChance,
  pumpMultiplier,
  rawMultiplier,
  type PumpDifficulty,
} from './multiplier.js'

describe('difficulty configs', () => {
  it('match Stake: pops per difficulty', () => {
    expect(DIFFICULTIES.easy.pops).toBe(1)
    expect(DIFFICULTIES.medium.pops).toBe(3)
    expect(DIFFICULTIES.hard.pops).toBe(5)
    expect(DIFFICULTIES.expert.pops).toBe(10)
  })

  it('max pumps = 25 − pops', () => {
    expect(maxPumps('easy')).toBe(24)
    expect(maxPumps('medium')).toBe(22)
    expect(maxPumps('hard')).toBe(20)
    expect(maxPumps('expert')).toBe(15)
  })
})

describe('rawMultiplier', () => {
  it('is 1 − edge before any pump', () => {
    for (const d of DIFFICULTY_ORDER) {
      expect(rawMultiplier(d, 0)).toBeCloseTo(1 - HOUSE_EDGE, 10)
    }
  })

  it('follows (1−edge)·C(25,j)/C(25−pops,j)', () => {
    // Easy first pump: 0.98 × 25/24
    expect(rawMultiplier('easy', 1)).toBeCloseTo(0.98 * (CELLS / 24), 10)
    // Hard first pump: 0.98 × 25/20
    expect(rawMultiplier('hard', 1)).toBeCloseTo(0.98 * (CELLS / 20), 10)
  })

  it('Expert full run = 0.98 × C(25,15) = 3,203,384.80', () => {
    // C(25,15) = C(25,10) = 3,268,760
    expect(rawMultiplier('expert', 15)).toBeCloseTo(0.98 * 3_268_760, 2)
  })
})

describe('pumpMultiplier — matches Stake published tables', () => {
  it('Easy: 1.02× then 1.07× (pumps 1 and 2)', () => {
    expect(pumpMultiplier('easy', 1)).toBe(1.02)
    expect(pumpMultiplier('easy', 2)).toBe(1.07)
  })

  it('Hard: 1.23× then 1.55× (pumps 1 and 2)', () => {
    expect(pumpMultiplier('hard', 1)).toBe(1.23)
    expect(pumpMultiplier('hard', 2)).toBe(1.55)
  })

  it('Expert: 1.63× then 2.80× (pumps 1 and 2)', () => {
    expect(pumpMultiplier('expert', 1)).toBe(1.63)
    expect(pumpMultiplier('expert', 2)).toBe(2.8)
  })

  it('Expert tops out at 3,203,384.80×', () => {
    expect(pumpMultiplier('expert', 15)).toBe(3_203_384.8)
  })

  it('Easy tops out at 24.50×', () => {
    expect(pumpMultiplier('easy', 24)).toBe(24.5)
  })
})

describe('nextSurviveChance — conditional odds of the next single pump', () => {
  it('Easy: first pump 96% (24/25), second 23/24', () => {
    expect(nextSurviveChance('easy', 0)).toBeCloseTo(24 / 25, 10)
    expect(nextSurviveChance('easy', 1)).toBeCloseTo(23 / 24, 10)
  })

  it('Expert: first pump 60% (15/25), second 14/24', () => {
    expect(nextSurviveChance('expert', 0)).toBeCloseTo(15 / 25, 10)
    expect(nextSurviveChance('expert', 1)).toBeCloseTo(14 / 24, 10)
  })

  it('the product reproduces Stake’s cumulative odds (Easy 92%, Expert 35% at pump 2)', () => {
    const cumulative = (d: 'easy' | 'expert', pumps: number) =>
      Array.from({ length: pumps }, (_, i) => nextSurviveChance(d, i)).reduce((a, b) => a * b, 1)
    expect(cumulative('easy', 2)).toBeCloseTo(0.92, 10)
    expect(cumulative('expert', 2)).toBeCloseTo(0.35, 10)
  })

  it('is 0 once every safe cell is gone', () => {
    expect(nextSurviveChance('easy', maxPumps('easy'))).toBe(0)
  })
})

describe('house edge — every cash-out point is house-profitable', () => {
  // Chance of surviving to bank exactly `j` pumps = Π of the per-pump odds.
  const survivalTo = (d: PumpDifficulty, j: number) =>
    Array.from({ length: j }, (_, i) => nextSurviveChance(d, i)).reduce((a, b) => a * b, 1)

  it('EV of any cash-out (exact odds) is EXACTLY 1 − edge, for every difficulty', () => {
    // survival(j) × payout(j) = (1−edge) for all j → the house holds the edge on
    // every bet regardless of when (or whether) the player cashes out.
    for (const d of DIFFICULTY_ORDER) {
      for (let j = 1; j <= maxPumps(d); j++) {
        expect(survivalTo(d, j) * rawMultiplier(d, j)).toBeCloseTo(1 - HOUSE_EDGE, 9)
      }
    }
  })

  it('EV of the actual rounded payout NEVER reaches 1 — no click beats the house', () => {
    for (const d of DIFFICULTY_ORDER) {
      for (let j = 1; j <= maxPumps(d); j++) {
        expect(survivalTo(d, j) * pumpMultiplier(d, j)).toBeLessThan(1)
      }
    }
  })
})
