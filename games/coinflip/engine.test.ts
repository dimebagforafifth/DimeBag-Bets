import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import {
  cashOut,
  COIN_WIN_PROB,
  createCoinFlip,
  flip,
  rtpOf,
  stepMultiplier,
} from './engine.js'
import { coinAt, coinsUpTo, verifyCoinFlips } from './fair.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'coinflip-client', nonce: 1, serverSeed: 'coinflip-server' } as const

describe('coin derivation', () => {
  it('is deterministic and in the heads/tails set', () => {
    const seq = coinsUpTo(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 8)
    expect(seq).toHaveLength(8)
    for (const c of seq) expect(c === 'heads' || c === 'tails').toBe(true)
    // coinAt(index) matches the sequence at that index
    for (let i = 0; i < seq.length; i++) {
      expect(coinAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, i)).toBe(seq[i])
    }
    // stable across calls (same seeds → same coins)
    expect(coinsUpTo(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 8)).toEqual(seq)
  })
})

describe('stepMultiplier + rtp', () => {
  it('is (1 − edge)/0.5 = 1.96× at the default 2% edge (matches Stake)', () => {
    expect(stepMultiplier()).toBe(1.96)
    expect(stepMultiplier({ edge: 0 })).toBe(2)
    expect(stepMultiplier({ edge: 0.1 })).toBeCloseTo(1.8, 6)
  })

  it('a single call returns 1 − edge in expectation (RTP in band)', () => {
    expect(COIN_WIN_PROB).toBe(0.5)
    expect(rtpOf()).toBeCloseTo(0.98, 6)
    expect(rtpOf()).toBeGreaterThan(0.97)
    expect(rtpOf()).toBeLessThanOrEqual(1)
    expect(rtpOf({ edge: 0 })).toBeCloseTo(1, 6)
  })
})

describe('createCoinFlip + flip', () => {
  it('holds the stake and starts an empty streak at 1×', () => {
    const a = account()
    const g = createCoinFlip(a, { stake: 1000, ...BASE })
    expect(g.multiplier).toBe(1)
    expect(g.status).toBe('active')
    expect(g.calls).toHaveLength(0)
    expect(g.results).toHaveLength(0)
    expect(a.pending).toBe(1000)
    expect(a.balance).toBe(0)
    expect(g.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('a correct call grows the multiplier by 1.96× each time; stake stays at risk', () => {
    const a = account()
    const g = createCoinFlip(a, { stake: 1000, ...BASE })

    // Always call the coin that will actually land → guaranteed correct.
    const first = coinAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 0)
    const r1 = flip(a, g, first)
    expect(r1.correct).toBe(true)
    expect(r1.coin).toBe(first)
    expect(g.status).toBe('active')
    expect(g.multiplier).toBe(1.96)
    expect(a.pending).toBe(1000) // still at risk
    expect(a.balance).toBe(0)

    const second = coinAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 1)
    const r2 = flip(a, g, second)
    expect(r2.correct).toBe(true)
    expect(g.multiplier).toBe(round2(1.96 * 1.96)) // 3.84
    expect(g.calls).toEqual([first, second])
    expect(g.results).toEqual([first, second])
  })

  it('a wrong call busts the streak and loses the stake', () => {
    const a = account()
    const g = createCoinFlip(a, { stake: 1000, ...BASE })
    const coin = coinAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 0)
    const wrong: typeof coin = coin === 'heads' ? 'tails' : 'heads'
    const r = flip(a, g, wrong)
    expect(r.correct).toBe(false)
    expect(g.status).toBe('busted')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-1000)
    // cannot keep flipping once busted
    expect(() => flip(a, g, 'heads')).toThrow(/not active/)
  })
})

describe('cashOut', () => {
  it('refuses before any win, then settles at the running multiplier', () => {
    const a = account()
    const g = createCoinFlip(a, { stake: 1000, ...BASE })
    expect(() => cashOut(a, g)).toThrow(/nothing to cash out/)

    const first = coinAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 0)
    flip(a, g, first)
    const m = g.multiplier // 1.96
    cashOut(a, g)
    expect(g.status).toBe('cashed')
    expect(g.payoutMultiplier).toBe(m)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(1000 * (m - 1))) // +980
    // cannot cash out twice
    expect(() => cashOut(a, g)).toThrow(/not active/)
  })

  it('banks a two-correct-call streak at 3.84×', () => {
    const a = account()
    const g = createCoinFlip(a, { stake: 1000, ...BASE })
    flip(a, g, coinAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 0))
    flip(a, g, coinAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 1))
    const m = g.multiplier
    expect(m).toBe(round2(1.96 * 1.96))
    cashOut(a, g)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(1000 * (m - 1)))
  })
})

describe('provably fair', () => {
  it('verifies a real streak round-trip and rejects tampering', () => {
    const a = account()
    const g = createCoinFlip(a, { stake: 1000, ...BASE })
    // a correct call then a wrong one (busts)
    const c0 = coinAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 0)
    flip(a, g, c0)
    const c1 = coinAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 1)
    flip(a, g, c1 === 'heads' ? 'tails' : 'heads')

    expect(verifyCoinFlips(g.serverSeed, g.clientSeed, g.nonce, g.calls, g.results)).toBe(true)

    // a tampered coin result fails verification
    const badResults = [...g.results]
    badResults[0] = badResults[0] === 'heads' ? 'tails' : 'heads'
    expect(verifyCoinFlips(g.serverSeed, g.clientSeed, g.nonce, g.calls, badResults)).toBe(false)

    // a wrong server seed fails verification
    expect(verifyCoinFlips('other-seed', g.clientSeed, g.nonce, g.calls, g.results)).toBe(false)
  })
})

const round2 = (n: number) => Math.round(n * 100) / 100
