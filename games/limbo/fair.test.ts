import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LIMBO_CONFIG,
  limboFromFloat,
  limboFromSeeds,
  MAX_MULTIPLIER,
  totalEdge,
  verifyLimbo,
  winChanceFor,
} from './fair.js'

describe('limboFromFloat (Stake formula)', () => {
  it('is max(1, floor((1−edge)/float·100)/100)', () => {
    expect(limboFromFloat(0.5)).toBe(1.98) // 0.99/0.5 = 1.98
    expect(limboFromFloat(0.99)).toBe(1) // 0.99/0.99 = 1.00
    expect(limboFromFloat(0.01)).toBe(99) // 0.99/0.01 = 99
  })

  it('never goes below 1.00× and caps at the max', () => {
    expect(limboFromFloat(0.999999)).toBe(1)
    expect(limboFromFloat(0)).toBe(MAX_MULTIPLIER)
    expect(limboFromFloat(1e-12)).toBe(MAX_MULTIPLIER)
  })

  it('a larger edge lowers the result for the same float', () => {
    expect(limboFromFloat(0.5, { baseEdge: 0.05, spread: 0 })).toBeLessThan(limboFromFloat(0.5))
  })
})

describe('house edge / win chance', () => {
  it('defaults to 1% base, no spread', () => {
    expect(DEFAULT_LIMBO_CONFIG).toEqual({ baseEdge: 0.01, spread: 0 })
    expect(totalEdge()).toBeCloseTo(0.01, 10)
  })

  it('win chance is 100·(1−edge)/target → EV = (1−edge)', () => {
    for (const t of [1.5, 2, 5, 50]) {
      const chance = winChanceFor(t)
      expect((chance / 100) * t).toBeCloseTo(1 - 0.01, 10)
    }
  })

  it('realizes ~1% edge over many seeds (simulated RTP at target 2×)', () => {
    let staked = 0
    let returned = 0
    for (let n = 0; n < 8000; n++) {
      const result = limboFromSeeds('srv', 'cli', n)
      staked += 1
      if (result >= 2) returned += 2
    }
    const rtp = returned / staked
    expect(rtp).toBeGreaterThan(0.95)
    expect(rtp).toBeLessThan(1.03)
  })
})

describe('limboFromSeeds / verify', () => {
  it('is deterministic and verifiable', () => {
    const r = limboFromSeeds('srv', 'cli', 3)
    expect(limboFromSeeds('srv', 'cli', 3)).toBe(r)
    expect(verifyLimbo('srv', 'cli', 3, r)).toBe(true)
    expect(verifyLimbo('srv', 'cli', 3, r + 0.01)).toBe(false)
  })
})
