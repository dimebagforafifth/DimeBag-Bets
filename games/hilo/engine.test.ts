import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import {
  cashOut,
  createHiloGame,
  currentCard,
  guess,
  probHigher,
  probLower,
  skip,
  stepMultiplier,
} from './engine.js'
import { cardAt, verifyHilo } from './fair.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'hilo-client', nonce: 1, serverSeed: 'hilo-server' } as const

describe('probabilities', () => {
  it('higher/lower are the rank counts over 52, with equal counting both ways', () => {
    // rank 1 (a 2, the lowest): higher-or-same is certain, lower-or-same is just the four 2s
    expect(probHigher(1)).toBeCloseTo(1, 12)
    expect(probLower(1)).toBeCloseTo(4 / 52, 12)
    // rank 13 (an Ace, the highest): mirror image — Ace-high, like Stake
    expect(probLower(13)).toBeCloseTo(1, 12)
    expect(probHigher(13)).toBeCloseTo(4 / 52, 12)
    // a middle rank: both sides include the equal rank, so they overlap (sum > 1)
    expect(probHigher(7) + probLower(7)).toBeGreaterThan(1)
  })
})

describe('per-card multipliers (Ace-high, exactly like Stake at 1% edge)', () => {
  // Independently from the engine, price each rank straight off the deck counts:
  // higher-or-same covers ranks r..13, lower-or-same covers ranks 1..r; multiplier
  // is 0.99 / probability, never below 1×. The engine must match all 13 cards.
  it('matches the Stake ladder for every rank', () => {
    for (let rank = 1; rank <= 13; rank++) {
      const pHi = (4 * (14 - rank)) / 52 // ranks r..13
      const pLo = (4 * rank) / 52 // ranks 1..r
      const expHi = Math.max(1, Math.round((0.99 / pHi) * 100) / 100)
      const expLo = Math.max(1, Math.round((0.99 / pLo) * 100) / 100)
      expect(stepMultiplier(rank, 'hi'), `rank ${rank} higher`).toBeCloseTo(expHi, 9)
      expect(stepMultiplier(rank, 'lo'), `rank ${rank} lower`).toBeCloseTo(expLo, 9)
    }
  })

  it('the extremes behave correctly: nothing beats an Ace, nothing is under a 2', () => {
    // Ace (rank 13, highest): higher-or-same only wins on another Ace (rare, big);
    // lower-or-same is certain → no profit (1×).
    expect(stepMultiplier(13, 'hi')).toBeGreaterThan(12)
    expect(stepMultiplier(13, 'lo')).toBe(1)
    // 2 (rank 1, lowest): the mirror.
    expect(stepMultiplier(1, 'lo')).toBeGreaterThan(12)
    expect(stepMultiplier(1, 'hi')).toBe(1)
    // A high card still wins a "higher" bet when it's the next card: e.g. on a King
    // (rank 12), higher-or-same covers K and A, so it's a real (not dead) bet.
    expect(stepMultiplier(12, 'hi')).toBeGreaterThan(1)
    expect(probHigher(12)).toBeCloseTo((4 * 2) / 52, 12) // K + A
  })

  it('higher on rank r pays the same as lower on its mirror rank', () => {
    for (let rank = 1; rank <= 13; rank++) {
      expect(stepMultiplier(rank, 'hi')).toBeCloseTo(stepMultiplier(14 - rank, 'lo'), 9)
    }
  })
})

describe('stepMultiplier', () => {
  it('is (1 − edge)/P and never drops below 1×', () => {
    // King → lower-or-same is near-certain → clamped to 1×
    expect(stepMultiplier(13, 'lo')).toBe(1)
    // King → higher-or-same is rare (4/52) → big multiplier ≈ 0.99 / (4/52) = 12.87
    expect(stepMultiplier(13, 'hi')).toBeCloseTo(12.87, 2)
    // a different edge moves it
    expect(stepMultiplier(13, 'hi', { edge: 0 })).toBeGreaterThan(stepMultiplier(13, 'hi', { edge: 0.1 }))
  })
})

describe('createHiloGame + guess', () => {
  it('holds the stake and deals a first card', () => {
    const a = account()
    const g = createHiloGame(a, { stake: 1000, ...BASE })
    expect(g.cards).toHaveLength(1)
    expect(g.multiplier).toBe(1)
    expect(a.pending).toBe(1000)
    expect(currentCard(g)).toEqual(cardAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 0))
  })

  it('a correct guess grows the multiplier; a wrong one busts and loses the stake', () => {
    const a = account()
    const g = createHiloGame(a, { stake: 1000, ...BASE })
    const cur = currentCard(g).rank
    const next = cardAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 1)
    // Choose the guess that is correct for this deal, and check the multiplier grows.
    const dir = next.rank >= cur ? 'hi' : 'lo'
    const expected = stepMultiplier(cur, dir)
    const res = guess(a, g, dir)
    expect(res.correct).toBe(true)
    expect(g.status).toBe('active')
    expect(g.multiplier).toBeCloseTo(expected, 6)
    expect(a.pending).toBe(1000) // still at risk

    // Now force a wrong guess from the new current card.
    const cur2 = currentCard(g).rank
    const next2 = cardAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 2)
    const wrong = next2.rank >= cur2 ? 'lo' : 'hi'
    if (next2.rank === cur2) return // equal wins both ways — skip this corner in the fixture
    const res2 = guess(a, g, wrong)
    expect(res2.correct).toBe(false)
    expect(g.status).toBe('busted')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-1000)
  })
})

describe('cashOut', () => {
  it('settles at the running multiplier and refuses before any win', () => {
    const a = account()
    const g = createHiloGame(a, { stake: 1000, ...BASE })
    expect(() => cashOut(a, g)).toThrow(/nothing to cash out/)

    const cur = currentCard(g).rank
    const next = cardAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 1)
    const dir = next.rank >= cur ? 'hi' : 'lo'
    guess(a, g, dir)
    const m = g.multiplier
    cashOut(a, g)
    expect(g.status).toBe('cashed')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(1000 * (m - 1)))
  })

  it('skip deals a fresh card without changing the multiplier or risk', () => {
    const a = account()
    const g = createHiloGame(a, { stake: 1000, ...BASE })
    skip(g)
    expect(g.cards).toHaveLength(2)
    expect(g.multiplier).toBe(1)
    expect(a.balance).toBe(0)
  })
})

describe('provably fair', () => {
  it('exposes a verifiable card sequence', () => {
    const a = account()
    const g = createHiloGame(a, { stake: 1000, ...BASE })
    const cur = currentCard(g).rank
    const next = cardAt(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 1)
    guess(a, g, next.rank >= cur ? 'hi' : 'lo')
    expect(g.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyHilo(g.serverSeed, g.clientSeed, g.nonce, g.cards)).toBe(true)
  })
})
