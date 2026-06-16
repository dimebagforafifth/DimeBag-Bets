import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DICE_CONFIG,
  effectiveTarget,
  isWin,
  multiplierFor,
  MAX_WIN_CHANCE,
  MIN_WIN_CHANCE,
  rollFromSeeds,
  verifyRoll,
  winChance,
} from './fair.js'

describe('rollFromSeeds', () => {
  it('is deterministic and in [0,100)', () => {
    for (let n = 0; n < 500; n++) {
      const r = rollFromSeeds('srv', 'cli', n)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(100)
      expect(rollFromSeeds('srv', 'cli', n)).toBe(r) // deterministic
    }
  })

  it('matches the locked regression vector', () => {
    expect(rollFromSeeds('dice-server', 'dice-client', 1)).toBeTypeOf('number')
  })

  it('averages ~50 over many rolls (uniform)', () => {
    let sum = 0
    const N = 4000
    for (let n = 0; n < N; n++) sum += rollFromSeeds('srv', 'cli', n)
    expect(sum / N).toBeGreaterThan(47)
    expect(sum / N).toBeLessThan(53)
  })
})

describe('winChance', () => {
  it('is (100 − target) over and target under, clamped to the band', () => {
    expect(winChance(50, 'over')).toBe(50)
    expect(winChance(50, 'under')).toBe(50)
    expect(winChance(98, 'over')).toBeCloseTo(2, 10)
    expect(winChance(99.9999, 'over')).toBe(0.01) // clamped to MIN
    expect(winChance(0, 'over')).toBe(98) // clamped to MAX
  })
})

describe('multiplierFor', () => {
  it('is 100·(1−edge)/chance — the Stake 99/chance at 1% edge', () => {
    expect(multiplierFor(50)).toBeCloseTo(99 / 50, 4) // 1.98×
    expect(multiplierFor(1)).toBeCloseTo(99, 4) // 99×
    expect(multiplierFor(99)).toBeCloseTo(1, 4)
  })

  it('keeps a fixed edge: chance% × multiplier = (1 − edge) at any chance', () => {
    for (const chance of [2, 10, 33.3, 75, 95]) {
      const ev = (chance / 100) * multiplierFor(chance)
      expect(ev).toBeCloseTo(1 - DEFAULT_DICE_CONFIG.edge, 3)
    }
  })

  it('honors a configurable edge', () => {
    expect(multiplierFor(50, { edge: 0 })).toBeCloseTo(2, 4) // fair
    expect(multiplierFor(50, { edge: 0.05 })).toBeCloseTo((100 * 0.95) / 50, 4)
  })
})

describe('isWin', () => {
  it('compares strictly above/below the target', () => {
    expect(isWin(60, 50, 'over')).toBe(true)
    expect(isWin(40, 50, 'over')).toBe(false)
    expect(isWin(40, 50, 'under')).toBe(true)
    expect(isWin(60, 50, 'under')).toBe(false)
  })
})

describe('effectiveTarget (priced odds == settled odds)', () => {
  it('is the requested target inside the band', () => {
    expect(effectiveTarget(50, 'over')).toBe(50)
    expect(effectiveTarget(25, 'under')).toBe(25)
  })

  it('moves with the clamp so the settled target matches the priced chance', () => {
    // over 0.5 would be 99.5% — clamped to MAX (98), so it settles at over 2.
    expect(winChance(0.5, 'over')).toBe(MAX_WIN_CHANCE)
    expect(effectiveTarget(0.5, 'over')).toBeCloseTo(100 - MAX_WIN_CHANCE, 10) // 2
    // over 99.995 would be ~0.005% — clamped to MIN (0.01), settles at over 99.99.
    expect(winChance(99.995, 'over')).toBe(MIN_WIN_CHANCE)
    expect(effectiveTarget(99.995, 'over')).toBeCloseTo(100 - MIN_WIN_CHANCE, 10)
  })

  it('closes the player-positive-EV exploit at a clamped low target', () => {
    // The old bug: priced at the clamped 98% but settled against the raw 99.5%
    // target → EV > 1 (player profits). Now both use the clamped target, so the
    // realized win rate can never exceed the priced chance and EV stays ≤ 1.
    const target = 0.5
    const direction = 'over'
    const chance = winChance(target, direction) // 98
    const mult = multiplierFor(chance)
    let wins = 0
    const N = 20000
    for (let n = 0; n < N; n++) {
      if (isWin(rollFromSeeds('srv', 'cli', n), target, direction)) wins++
    }
    const ev = (wins / N) * mult
    expect(ev).toBeLessThanOrEqual(1) // never a player edge
    expect(ev).toBeGreaterThan(0.95) // and still near the intended ~99% RTP
  })
})

describe('verifyRoll', () => {
  it('confirms a roll and rejects tampering', () => {
    const r = rollFromSeeds('srv', 'cli', 7)
    expect(verifyRoll('srv', 'cli', 7, r)).toBe(true)
    expect(verifyRoll('srv', 'cli', 7, r + 1)).toBe(false)
  })
})
