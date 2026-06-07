import { describe, it, expect } from 'vitest'
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  HOUSE_EDGE,
  ROWS,
  badTiles,
  rawMultiplier,
  rowWinChance,
  round2,
  towerMultiplier,
  type TowerDifficulty,
} from './difficulty.js'

describe('difficulty configs', () => {
  it('match Stake: tiles and eggs per row', () => {
    expect(DIFFICULTIES.easy).toMatchObject({ tiles: 4, safe: 3 })
    expect(DIFFICULTIES.medium).toMatchObject({ tiles: 3, safe: 2 })
    expect(DIFFICULTIES.hard).toMatchObject({ tiles: 2, safe: 1 })
    expect(DIFFICULTIES.expert).toMatchObject({ tiles: 3, safe: 1 })
    expect(DIFFICULTIES.master).toMatchObject({ tiles: 4, safe: 1 })
  })

  it('skulls per row = tiles − eggs', () => {
    expect(badTiles('easy')).toBe(1)
    expect(badTiles('expert')).toBe(2)
    expect(badTiles('master')).toBe(3)
  })

  it('row win chance is safe/tiles (Expert 1/3, Master 1/4)', () => {
    expect(rowWinChance('expert')).toBeCloseTo(1 / 3, 10)
    expect(rowWinChance('master')).toBeCloseTo(0.25, 10)
  })
})

describe('rawMultiplier', () => {
  it('is 1 − edge at level 0', () => {
    for (const d of DIFFICULTY_ORDER) {
      expect(rawMultiplier(d, 0)).toBeCloseTo(1 - HOUSE_EDGE, 10)
    }
  })

  it('follows (1−edge)·(tiles/safe)^level', () => {
    expect(rawMultiplier('hard', 3)).toBeCloseTo(0.98 * 2 ** 3, 10)
    expect(rawMultiplier('master', ROWS)).toBeCloseTo(0.98 * 4 ** 9, 4)
  })
})

describe('towerMultiplier — matches Stake published values', () => {
  it('Master row 1 = 3.92× and the top = 256,901.12×', () => {
    expect(towerMultiplier('master', 1)).toBe(3.92)
    expect(towerMultiplier('master', 9)).toBe(256_901.12)
  })

  it('Easy tops out at 13.05×', () => {
    expect(towerMultiplier('easy', 9)).toBe(13.05)
  })

  it('row-1 multipliers across difficulties', () => {
    const row1: Record<TowerDifficulty, number> = {
      easy: 1.31, // 0.98 × 4/3 = 1.30666 → 1.31
      medium: 1.47, // 0.98 × 3/2
      hard: 1.96, // 0.98 × 2
      expert: 2.94, // 0.98 × 3
      master: 3.92, // 0.98 × 4
    }
    for (const d of DIFFICULTY_ORDER) {
      expect(towerMultiplier(d, 1)).toBe(row1[d])
    }
  })
})

describe('house edge — every cash-out level is house-profitable', () => {
  // Chance of climbing to cash out at exactly `level` = (safe/tiles)^level.
  const survivalTo = (d: TowerDifficulty, level: number) => rowWinChance(d) ** level

  it('EV of any cash-out (exact odds) is EXACTLY 1 − edge, for every difficulty', () => {
    // survival(level) × payout(level) = (1−edge) at every level → the house holds
    // its edge on every bet, no matter how high the player climbs or when they bank.
    for (const d of DIFFICULTY_ORDER) {
      for (let level = 1; level <= ROWS; level++) {
        expect(survivalTo(d, level) * rawMultiplier(d, level)).toBeCloseTo(1 - HOUSE_EDGE, 9)
      }
    }
  })

  it('EV of the actual rounded payout NEVER reaches 1 — no climb beats the house', () => {
    for (const d of DIFFICULTY_ORDER) {
      for (let level = 1; level <= ROWS; level++) {
        expect(survivalTo(d, level) * towerMultiplier(d, level)).toBeLessThan(1)
      }
    }
  })
})

describe('round2', () => {
  it('rounds half-up past binary float error', () => {
    // 0.98×1.5 floats to 1.4699999999999998 — must still land on 1.47.
    expect(round2(0.98 * 1.5)).toBe(1.47)
    // 0.98×1.25 = 1.225 floats just under .5 — must round UP to 1.23 (Stake's value).
    expect(round2(0.98 * 1.25)).toBe(1.23)
    expect(round2(1.225)).toBe(1.23)
    expect(round2(1.224)).toBe(1.22)
  })
})
