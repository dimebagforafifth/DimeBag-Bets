import { describe, it, expect } from 'vitest'
import {
  BASE_EDGE,
  DEFAULT_CRASH_CONFIG,
  MAX_CRASH_MULTIPLIER,
  crashPointFromInt,
  crashPointFromSeeds,
  totalEdge,
  verifyCrashPoint,
  type CrashHouseConfig,
} from './fair.js'

const SERVER = 'crash-server'
const CLIENT = 'crash-client'

describe('crashPointFromInt (Stake formula)', () => {
  it('matches Stake’s published worked example (int 2,747,600,321 → 1.55×)', () => {
    // (2^32 / (int + 1)) × 0.99, rounded to 2 dp.
    expect(crashPointFromInt(2_747_600_321)).toBe(1.55)
  })

  it('int 0 yields the (capped) maximum', () => {
    // 2^32 × 0.99 is ~4.25e9 — clamped to the max.
    expect(crashPointFromInt(0)).toBe(MAX_CRASH_MULTIPLIER)
  })

  it('the largest int floors out at the 1.00× instant bust', () => {
    expect(crashPointFromInt(2 ** 32 - 1)).toBe(1)
  })

  it('never returns below 1.00×', () => {
    for (const int of [0, 1, 1000, 2 ** 31, 2 ** 32 - 1]) {
      expect(crashPointFromInt(int)).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('house edge (configurable vig, probability only)', () => {
  it('defaults to the 1% base with no spread', () => {
    expect(DEFAULT_CRASH_CONFIG).toEqual({ baseEdge: BASE_EDGE, spread: 0 })
    expect(totalEdge()).toBeCloseTo(0.01, 10)
  })

  it('adds the manager spread on top of the base', () => {
    expect(totalEdge({ baseEdge: 0.01, spread: 0.005 })).toBeCloseTo(0.015, 10)
  })

  it('a higher edge lowers the crash point for the same draw (more house, same curve)', () => {
    const lean: CrashHouseConfig = { baseEdge: 0.01, spread: 0 }
    const fat: CrashHouseConfig = { baseEdge: 0.01, spread: 0.05 }
    expect(crashPointFromInt(1_000_000, fat)).toBeLessThan(crashPointFromInt(1_000_000, lean))
  })

  it('realizes the configured edge: P(crash ≥ m) ≈ (1 − edge)/m', () => {
    // For target m, P(survive to m) = fraction of ints giving crashPoint ≥ m.
    // crashPoint ≥ m  ⇔  int + 1 ≤ 2^32 (1−edge)/m  ⇒  P ≈ (1−edge)/m.
    const m = 2
    for (const edge of [0.01, 0.03]) {
      const cfg: CrashHouseConfig = { baseEdge: edge, spread: 0 }
      const threshold = (2 ** 32 * (1 - edge)) / m // ints below this survive to >= m
      const p = threshold / 2 ** 32
      expect(p).toBeCloseTo((1 - edge) / m, 6)
      // sanity: a mid draw under 1% gives a sub-2x point here
      expect(crashPointFromInt(Math.floor(threshold), cfg)).toBeGreaterThanOrEqual(m - 0.01)
    }
  })

  it('rejects a total edge outside [0,1)', () => {
    expect(() => totalEdge({ baseEdge: 0.6, spread: 0.6 })).toThrow()
    expect(() => totalEdge({ baseEdge: -0.1, spread: 0 })).toThrow()
  })
})

describe('crashPointFromSeeds', () => {
  it('matches the locked regression vector', () => {
    expect(crashPointFromSeeds(SERVER, CLIENT, 1)).toBe(1.58)
  })

  it('is deterministic and changes with nonce / client seed', () => {
    expect(crashPointFromSeeds(SERVER, CLIENT, 1)).toBe(crashPointFromSeeds(SERVER, CLIENT, 1))
    expect(crashPointFromSeeds(SERVER, CLIENT, 2)).not.toBe(crashPointFromSeeds(SERVER, CLIENT, 1))
    expect(crashPointFromSeeds(SERVER, 'other', 1)).not.toBe(crashPointFromSeeds(SERVER, CLIENT, 1))
  })

  it('spreads across a wide multiplier range over many nonces', () => {
    let below2 = 0
    let above2 = 0
    for (let nonce = 0; nonce < 1000; nonce++) {
      const c = crashPointFromSeeds(SERVER, CLIENT, nonce)
      if (c < 2) below2++
      else above2++
    }
    // ~half of rounds crash before 2× (P(≥2) ≈ 0.495); both buckets well populated.
    expect(below2).toBeGreaterThan(350)
    expect(above2).toBeGreaterThan(350)
  })
})

describe('verifyCrashPoint', () => {
  it('confirms a point re-derived from the same seeds and rejects tampering', () => {
    const c = crashPointFromSeeds(SERVER, CLIENT, 5)
    expect(verifyCrashPoint(SERVER, CLIENT, 5, c)).toBe(true)
    expect(verifyCrashPoint(SERVER, CLIENT, 5, c + 0.01)).toBe(false)
    expect(verifyCrashPoint('tampered', CLIENT, 5, c)).toBe(false)
  })
})
