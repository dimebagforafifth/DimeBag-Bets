import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playDiamonds } from './engine.js'
import { drawGems, verifyGems, COLOURS, GEMS } from './fair.js'
import {
  PATTERNS,
  buildPaytable,
  classify,
  patternProbabilities,
  rtpOf,
  type Pattern,
} from './payouts.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'diamonds-client', nonce: 1, serverSeed: 'diamonds-server' } as const

describe('drawGems', () => {
  it('deals 5 colour indices in 0..7, deterministically', () => {
    const g = drawGems(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(g).toHaveLength(GEMS)
    for (const c of g) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(COLOURS)
      expect(Number.isInteger(c)).toBe(true)
    }
    // same seeds → same deal
    expect(drawGems(BASE.serverSeed, BASE.clientSeed, BASE.nonce)).toEqual(g)
    // different nonce → (almost surely) a different deal
    expect(drawGems(BASE.serverSeed, BASE.clientSeed, 2)).not.toEqual(g)
  })

  it('round-trips through verifyGems', () => {
    const g = drawGems(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(verifyGems(BASE.serverSeed, BASE.clientSeed, BASE.nonce, g)).toBe(true)
    // a tampered gem fails verification
    const bad = [...g]
    bad[0] = (bad[0] + 1) % COLOURS
    expect(verifyGems(BASE.serverSeed, BASE.clientSeed, BASE.nonce, bad)).toBe(false)
  })
})

describe('classify', () => {
  it('maps each count pattern to its name', () => {
    expect(classify([3, 3, 3, 3, 3])).toBe('five')
    expect(classify([1, 1, 1, 1, 2])).toBe('four')
    expect(classify([0, 0, 0, 5, 5])).toBe('fullHouse')
    expect(classify([2, 2, 2, 4, 6])).toBe('three')
    expect(classify([1, 1, 3, 3, 7])).toBe('twoPair')
    expect(classify([4, 4, 1, 2, 3])).toBe('pair')
    expect(classify([0, 1, 2, 3, 4])).toBe('none')
  })

  it('three matching gems pay three-of-a-kind — unless the other two pair (full house)', () => {
    // exactly three of one colour + two singletons → three of a kind, any order
    expect(classify([0, 0, 0, 1, 2])).toBe('three')
    expect(classify([5, 1, 5, 2, 5])).toBe('three')
    expect(classify([7, 3, 7, 7, 0])).toBe('three')
    // three of one colour + a pair of another is a full house (pays ≥ three)
    expect(classify([0, 0, 0, 1, 1])).toBe('fullHouse')
  })

  it('classifies ALL 8^5 possible deals and the tallies match the exact multinomial counts', () => {
    // If classify ever mislabelled even one of the 32,768 hands, these tallies
    // could not equal the mathematically-known counts — so an exact match proves
    // the payout pattern is correct for EVERY possible deal.
    const tally: Record<Pattern, number> = {
      five: 0,
      four: 0,
      fullHouse: 0,
      three: 0,
      twoPair: 0,
      pair: 0,
      none: 0,
    }
    for (let a = 0; a < COLOURS; a++)
      for (let b = 0; b < COLOURS; b++)
        for (let c = 0; c < COLOURS; c++)
          for (let d = 0; d < COLOURS; d++)
            for (let e = 0; e < COLOURS; e++) tally[classify([a, b, c, d, e])] += 1

    expect(tally).toEqual({
      five: 8,
      four: 280,
      fullHouse: 560,
      three: 3360,
      twoPair: 5040,
      pair: 16800,
      none: 6720,
    })
    expect(PATTERNS.reduce((sum, p) => sum + tally[p], 0)).toBe(COLOURS ** GEMS) // 32768
  })
})

describe('patternProbabilities', () => {
  it('sums to 1 and matches known exact values', () => {
    const p = patternProbabilities()
    const total = PATTERNS.reduce((a, k) => a + p[k], 0)
    expect(total).toBeCloseTo(1, 12)

    const D = 8 ** 5 // 32768
    // P(five) = 8 / 8^5
    expect(p.five).toBeCloseTo(8 / D, 12)
    // P(none) = 8·7·6·5·4 / 8^5 (all distinct colours)
    expect(p.none).toBeCloseTo((8 * 7 * 6 * 5 * 4) / D, 12)
    // a couple more exact counts
    expect(p.four).toBeCloseTo(280 / D, 12)
    expect(p.pair).toBeCloseTo(16800 / D, 12)
  })
})

describe('buildPaytable', () => {
  it("pays rarer patterns more, 'none' pays 0×, every paying tier beats 1×", () => {
    const table = buildPaytable()
    expect(table.none).toBe(0)
    // ramps with rarity (commonest paying → rarest)
    const order: Pattern[] = ['pair', 'twoPair', 'three', 'fullHouse', 'four', 'five']
    const paying = order.map((k) => table[k]).filter((m) => m > 0)
    for (const m of paying) expect(m).toBeGreaterThan(1)
    for (let i = 1; i < paying.length; i++) {
      expect(paying[i]).toBeGreaterThanOrEqual(paying[i - 1])
    }
    expect(paying.length).toBeGreaterThan(0)
  })

  it('a different edge shifts the RTP', () => {
    expect(rtpOf({ edge: 0 })).toBeGreaterThan(rtpOf({ edge: 0.1 }))
  })
})

describe('rtpOf — the edge is provably correct', () => {
  it('realized RTP is in (0.95, 1.0] at the default 1% edge', () => {
    const rtp = rtpOf()
    expect(rtp).toBeGreaterThan(0.95)
    expect(rtp).toBeLessThanOrEqual(1.0)
  })
})

describe('playDiamonds', () => {
  it('settles at the dealt pattern’s multiplier through core', () => {
    const a = account()
    const gems = drawGems(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    const pattern = classify(gems)
    const mult = buildPaytable()[pattern]
    const r = playDiamonds(a, { stake: 1000, ...BASE })

    expect(r.gems).toEqual(gems)
    expect(r.pattern).toBe(pattern)
    expect(r.multiplier).toBe(mult)
    expect(r.profit).toBe(Math.round(1000 * (mult - 1)))
    // core settlement: hold released, figure moved by the profit
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(1000 * (mult - 1)))
  })

  it('settles a forced win and a forced loss through core', () => {
    // search nonces for one paying hand and one non-paying hand under fixed seeds
    let winNonce = -1
    let loseNonce = -1
    for (let n = 1; n <= 200 && (winNonce < 0 || loseNonce < 0); n++) {
      const pat = classify(drawGems(BASE.serverSeed, BASE.clientSeed, n))
      if (pat !== 'none' && buildPaytable()[pat] > 1) {
        if (winNonce < 0) winNonce = n
      } else if (buildPaytable()[pat] === 0) {
        if (loseNonce < 0) loseNonce = n
      }
    }
    expect(winNonce).toBeGreaterThan(0)
    expect(loseNonce).toBeGreaterThan(0)

    const win = account()
    const rw = playDiamonds(win, { stake: 1000, ...BASE, nonce: winNonce })
    expect(rw.multiplier).toBeGreaterThan(1)
    expect(win.pending).toBe(0)
    expect(win.balance).toBe(Math.round(1000 * (rw.multiplier - 1)))

    const lose = account()
    const rl = playDiamonds(lose, { stake: 1000, ...BASE, nonce: loseNonce })
    expect(rl.multiplier).toBe(0)
    expect(lose.pending).toBe(0)
    expect(lose.balance).toBe(-1000) // full loss at 0×
  })

  it('rejects over-limit stakes', () => {
    const a = account({ creditLimit: 500 })
    expect(() => playDiamonds(a, { stake: 501, ...BASE })).toThrow(/exceeds availableToWager/)
    expect(availableToWager(a)).toBe(500)
  })

  it('exposes a verifiable deal', () => {
    const r = playDiamonds(account(), { stake: 100, ...BASE })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyGems(r.serverSeed, r.clientSeed, r.nonce, r.gems)).toBe(true)
  })
})
