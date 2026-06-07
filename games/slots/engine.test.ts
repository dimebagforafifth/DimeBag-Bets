import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playSlots } from './engine.js'
import { spin, verifySpin, REELS } from './fair.js'
import {
  SYMBOLS,
  CHERRY,
  buildPaytable,
  twoCherryMultiplier,
  multiplierFor,
  rtpOf,
  symbolProbability,
} from './payouts.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'slots-client', nonce: 1, serverSeed: 'slots-server' } as const

describe('spin (weighted reels)', () => {
  it('returns three in-range symbol indices, deterministically', () => {
    const r = spin(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(r).toHaveLength(REELS)
    for (const s of r) {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(SYMBOLS.length)
    }
    // identical seeds → identical reels
    expect(spin(BASE.serverSeed, BASE.clientSeed, BASE.nonce)).toEqual(r)
  })

  it('round-trips through verifySpin and rejects a tampered result', () => {
    const r = spin(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(verifySpin(BASE.serverSeed, BASE.clientSeed, BASE.nonce, r)).toBe(true)
    const tampered = [...r]
    tampered[0] = (tampered[0] + 1) % SYMBOLS.length
    expect(verifySpin(BASE.serverSeed, BASE.clientSeed, BASE.nonce, tampered)).toBe(false)
  })

  it('weighted mapping roughly tracks the reel weights over many nonces', () => {
    const counts = new Array(SYMBOLS.length).fill(0)
    const N = 6000
    for (let n = 0; n < N; n++) {
      for (const s of spin('w-server', 'w-client', n)) counts[s]++
    }
    const draws = N * REELS
    // the common cherry should out-appear the rare seven by a wide margin
    expect(counts[CHERRY] / draws).toBeGreaterThan(symbolProbability(CHERRY) * 0.8)
    expect(counts[SYMBOLS.length - 1]).toBeLessThan(counts[CHERRY])
  })
})

describe('multiplierFor', () => {
  it('pays three-of-a-kind, two-cherries, else 0×', () => {
    const table = buildPaytable()
    for (let i = 0; i < SYMBOLS.length; i++) {
      expect(multiplierFor([i, i, i])).toBe(table[i])
    }
    // exactly two cherries (any positions) pays the consolation
    expect(multiplierFor([CHERRY, CHERRY, 1])).toBe(twoCherryMultiplier())
    expect(multiplierFor([CHERRY, 1, CHERRY])).toBe(twoCherryMultiplier())
    // one cherry, or a non-matching mix → loss
    expect(multiplierFor([CHERRY, 1, 2])).toBe(0)
    expect(multiplierFor([1, 2, 3])).toBe(0)
  })

  it('every paying tier returns more than the stake', () => {
    for (const m of buildPaytable()) expect(m).toBeGreaterThan(1)
    expect(twoCherryMultiplier()).toBeGreaterThan(1)
  })
})

describe('rtpOf — the edge is provably correct', () => {
  it('symbol probabilities sum to 1', () => {
    const total = SYMBOLS.reduce((a, _s, i) => a + symbolProbability(i), 0)
    expect(total).toBeCloseTo(1, 12)
  })

  it('realized RTP sits in [0.95, 1.0) at the default 1% edge', () => {
    const rtp = rtpOf()
    expect(rtp).toBeGreaterThanOrEqual(0.95)
    expect(rtp).toBeLessThan(1.0)
    // computed to hit 0.99; rounding to 2dp leaves a hair of drift
    expect(rtp).toBeCloseTo(0.99, 2)
  })

  it('a smaller edge lifts the RTP', () => {
    expect(rtpOf({ edge: 0 })).toBeGreaterThan(rtpOf({ edge: 0.05 }))
  })
})

describe('playSlots — settlement through core', () => {
  it('a three-of-a-kind settles at the symbol pay (balance/pending math)', () => {
    // hand-pick seeds that produce a three-of-a-kind
    let found: { serverSeed: string; reels: number[] } | null = null
    for (let n = 0; n < 5000 && !found; n++) {
      const reels = spin('hit-server', 'hit-client', n)
      if (reels[0] === reels[1] && reels[1] === reels[2]) {
        found = { serverSeed: 'hit-server', reels }
        const a = account()
        const r = playSlots(a, { stake: 1000, clientSeed: 'hit-client', nonce: n, serverSeed: 'hit-server' })
        expect(r.reels).toEqual(reels)
        const mult = buildPaytable()[reels[0]]
        expect(r.multiplier).toBe(mult)
        expect(a.pending).toBe(0)
        expect(a.balance).toBe(Math.round(1000 * (mult - 1)))
        expect(r.profit).toBe(Math.round(1000 * (mult - 1)))
      }
    }
    expect(found).not.toBeNull()
  })

  it('a non-winning spin loses the whole stake (0×)', () => {
    // find seeds giving no win, then verify the loss settles to −stake
    for (let n = 0; n < 5000; n++) {
      const reels = spin('miss-server', 'miss-client', n)
      if (multiplierFor(reels) === 0) {
        const a = account()
        const r = playSlots(a, { stake: 1000, clientSeed: 'miss-client', nonce: n, serverSeed: 'miss-server' })
        expect(r.multiplier).toBe(0)
        expect(a.pending).toBe(0)
        expect(a.balance).toBe(-1000)
        expect(r.profit).toBe(-1000)
        return
      }
    }
    throw new Error('expected at least one losing spin in 5000 nonces')
  })

  it('rejects an over-limit stake and leaves the figure untouched', () => {
    const a = account({ creditLimit: 500 })
    expect(() =>
      playSlots(a, { stake: 501, clientSeed: 'c', nonce: 1, serverSeed: 's' }),
    ).toThrow(/exceeds availableToWager/)
    expect(a.pending).toBe(0)
    expect(availableToWager(a)).toBe(500)
  })

  it('exposes a verifiable spin (committed hash + revealed seed round-trip)', () => {
    const r = playSlots(account(), { stake: 100, ...BASE })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifySpin(r.serverSeed, r.clientSeed, r.nonce, r.reels)).toBe(true)
  })
})
