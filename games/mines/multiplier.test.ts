import { describe, it, expect } from 'vitest'
import {
  HOUSE_EDGE,
  rawMultiplier,
  displayMultiplier,
  minesMultiplier,
  safeTiles,
} from './multiplier.js'

describe('safeTiles', () => {
  it('is total tiles minus mines', () => {
    expect(safeTiles(1)).toBe(24)
    expect(safeTiles(3)).toBe(22)
    expect(safeTiles(24)).toBe(1)
  })
})

describe('rawMultiplier', () => {
  it('is 1 − edge before any reveal', () => {
    expect(rawMultiplier(3, 0)).toBeCloseTo(1 - HOUSE_EDGE, 10)
  })

  it('matches the Stake formula 0.99 × C(25,d)/C(25−m,d) for the first gem', () => {
    // 3 mines, 1 gem: 0.99 × 25/22
    expect(rawMultiplier(3, 1)).toBeCloseTo(0.99 * (25 / 22), 10)
    // 1 mine, 1 gem: 0.99 × 25/24
    expect(rawMultiplier(1, 1)).toBeCloseTo(0.99 * (25 / 24), 10)
  })

  it('hits the known max payout on a full clear at 12 mines: 0.99 × C(25,12) = 5,148,297', () => {
    // full clear: revealed === safeTiles === 13
    expect(rawMultiplier(12, 13)).toBeCloseTo(5_148_297, 2)
  })

  it('full clear of an m-mine board equals 0.99 × C(25, m)', () => {
    const C25_2 = 300 // C(25,2)
    expect(rawMultiplier(2, 23)).toBeCloseTo(0.99 * C25_2, 6)
  })

  it('increases strictly with each safe reveal', () => {
    let prev = 0
    for (let d = 0; d <= safeTiles(5); d++) {
      const m = rawMultiplier(5, d)
      expect(m).toBeGreaterThan(prev)
      prev = m
    }
  })

  it('every cash-out from the first gem on pays above 1×', () => {
    for (let mines = 1; mines <= 24; mines++) {
      expect(rawMultiplier(mines, 1)).toBeGreaterThan(1)
    }
  })

  it('rejects out-of-range mine counts and reveal counts', () => {
    expect(() => rawMultiplier(0, 0)).toThrow()
    expect(() => rawMultiplier(25, 0)).toThrow()
    expect(() => rawMultiplier(3, 23)).toThrow() // only 22 safe tiles
    expect(() => rawMultiplier(3, -1)).toThrow()
  })
})

describe('displayMultiplier / minesMultiplier', () => {
  it('floors to 2 decimals so the book never overpays the figure on screen', () => {
    expect(displayMultiplier(1.12999)).toBe(1.12)
    expect(displayMultiplier(1.03124)).toBe(1.03)
  })

  it('the player-facing first-gem multipliers match Stake to 2 decimals', () => {
    expect(minesMultiplier(1, 1)).toBe(1.03) // 0.99 × 25/24 = 1.031…
    expect(minesMultiplier(3, 1)).toBe(1.12) // 0.99 × 25/22 = 1.125
  })
})
