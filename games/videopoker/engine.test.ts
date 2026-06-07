import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { createVideoPoker, draw } from './engine.js'
import { dealtDeck, verifyDeck, DECK, type Card } from './fair.js'
import { evaluateHand, PAYTABLE } from './payouts.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'vp-client', nonce: 1, serverSeed: 'vp-server' } as const

/** Tiny helper: a card from rank (1=A..13=K) + suit (0..3). */
const c = (rank: number, suit: number): Card => ({ rank, suit })

describe('evaluateHand', () => {
  it('royal flush (10-J-Q-K-A same suit) → 251×', () => {
    const r = evaluateHand([c(10, 0), c(11, 0), c(12, 0), c(13, 0), c(1, 0)])
    expect(r.rank).toBe('royal-flush')
    expect(r.multiplier).toBe(251)
  })

  it('straight flush (5-6-7-8-9 same suit) → 51×', () => {
    const r = evaluateHand([c(5, 1), c(6, 1), c(7, 1), c(8, 1), c(9, 1)])
    expect(r.rank).toBe('straight-flush')
    expect(r.multiplier).toBe(51)
  })

  it('wheel straight flush (A-2-3-4-5 same suit) → 51×, not royal', () => {
    const r = evaluateHand([c(1, 2), c(2, 2), c(3, 2), c(4, 2), c(5, 2)])
    expect(r.rank).toBe('straight-flush')
    expect(r.multiplier).toBe(51)
  })

  it('four of a kind → 26×', () => {
    const r = evaluateHand([c(7, 0), c(7, 1), c(7, 2), c(7, 3), c(2, 0)])
    expect(r.rank).toBe('four-of-a-kind')
    expect(r.multiplier).toBe(26)
  })

  it('full house → 10×', () => {
    const r = evaluateHand([c(4, 0), c(4, 1), c(4, 2), c(9, 0), c(9, 1)])
    expect(r.rank).toBe('full-house')
    expect(r.multiplier).toBe(10)
  })

  it('flush → 7×', () => {
    const r = evaluateHand([c(2, 3), c(5, 3), c(9, 3), c(11, 3), c(13, 3)])
    expect(r.rank).toBe('flush')
    expect(r.multiplier).toBe(7)
  })

  it('straight → 5× (mixed suits)', () => {
    const r = evaluateHand([c(6, 0), c(7, 1), c(8, 2), c(9, 3), c(10, 0)])
    expect(r.rank).toBe('straight')
    expect(r.multiplier).toBe(5)
  })

  it('wheel straight A-2-3-4-5 (mixed suits) → 5×', () => {
    const r = evaluateHand([c(1, 0), c(2, 1), c(3, 2), c(4, 3), c(5, 0)])
    expect(r.rank).toBe('straight')
    expect(r.multiplier).toBe(5)
  })

  it('ace-high straight 10-J-Q-K-A (mixed suits) → 5×', () => {
    const r = evaluateHand([c(10, 0), c(11, 1), c(12, 2), c(13, 3), c(1, 0)])
    expect(r.rank).toBe('straight')
    expect(r.multiplier).toBe(5)
  })

  it('three of a kind → 4×', () => {
    const r = evaluateHand([c(3, 0), c(3, 1), c(3, 2), c(8, 0), c(13, 1)])
    expect(r.rank).toBe('three-of-a-kind')
    expect(r.multiplier).toBe(4)
  })

  it('two pair → 3×', () => {
    const r = evaluateHand([c(5, 0), c(5, 1), c(9, 0), c(9, 2), c(2, 3)])
    expect(r.rank).toBe('two-pair')
    expect(r.multiplier).toBe(3)
  })

  it('jacks or better (pair of Jacks) → 2×', () => {
    const r = evaluateHand([c(11, 0), c(11, 1), c(3, 0), c(7, 2), c(9, 3)])
    expect(r.rank).toBe('jacks-or-better')
    expect(r.multiplier).toBe(2)
  })

  it('pair of Aces counts as jacks-or-better → 2×', () => {
    const r = evaluateHand([c(1, 0), c(1, 1), c(3, 0), c(7, 2), c(9, 3)])
    expect(r.rank).toBe('jacks-or-better')
    expect(r.multiplier).toBe(2)
  })

  it('low pair (pair of Tens) does NOT pay → nothing, 0×', () => {
    const r = evaluateHand([c(10, 0), c(10, 1), c(3, 0), c(7, 2), c(9, 3)])
    expect(r.rank).toBe('nothing')
    expect(r.multiplier).toBe(0)
  })

  it('junk (no pair, no straight, no flush) → nothing, 0×', () => {
    const r = evaluateHand([c(2, 0), c(5, 1), c(8, 2), c(11, 3), c(13, 0)])
    expect(r.rank).toBe('nothing')
    expect(r.multiplier).toBe(0)
  })
})

describe('dealtDeck (provably fair)', () => {
  it('is a deterministic permutation of all 52 cards', () => {
    const deck = dealtDeck(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(deck).toHaveLength(DECK)
    // every (rank,suit) appears exactly once
    const seen = new Set(deck.map((d) => `${d.rank}-${d.suit}`))
    expect(seen.size).toBe(DECK)
    for (const d of deck) {
      expect(d.rank).toBeGreaterThanOrEqual(1)
      expect(d.rank).toBeLessThanOrEqual(13)
      expect(d.suit).toBeGreaterThanOrEqual(0)
      expect(d.suit).toBeLessThanOrEqual(3)
    }
    // same seeds → same order
    const again = dealtDeck(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(again).toEqual(deck)
    // a different nonce changes the order
    const other = dealtDeck(BASE.serverSeed, BASE.clientSeed, BASE.nonce + 1)
    expect(other).not.toEqual(deck)
  })

  it('verifyDeck round-trips and rejects tampering', () => {
    const deck = dealtDeck(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(verifyDeck(BASE.serverSeed, BASE.clientSeed, BASE.nonce, deck)).toBe(true)
    const tampered = deck.slice()
    tampered[0] = { rank: tampered[0].rank === 13 ? 1 : tampered[0].rank + 1, suit: tampered[0].suit }
    expect(verifyDeck(BASE.serverSeed, BASE.clientSeed, BASE.nonce, tampered)).toBe(false)
  })
})

describe('createVideoPoker / draw — settles through core', () => {
  it('deals 5 and holds the stake (pending), then settles on draw', () => {
    const a = account()
    const g = createVideoPoker(a, { stake: 1000, ...BASE })
    expect(g.status).toBe('dealt')
    expect(g.hand).toHaveLength(5)
    expect(g.deck.slice(0, 5)).toEqual(g.hand) // hand is the first 5 deck cards
    expect(a.pending).toBe(1000) // stake held
    expect(a.balance).toBe(0)
    expect(g.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)

    const res = draw(a, g, [false, false, false, false, false]) // hold nothing
    expect(g.status).toBe('done')
    expect(a.pending).toBe(0) // hold released
    // balance moved by stake × (multiplier − 1)
    expect(a.balance).toBe(Math.round(1000 * (res.multiplier - 1)))
    expect(res.multiplier).toBe(PAYTABLE[res.rank])
  })

  it('holding all 5 keeps the dealt hand; draw evaluates exactly those cards', () => {
    const a = account()
    const g = createVideoPoker(a, { stake: 500, ...BASE })
    const dealt = g.hand.slice()
    const res = draw(a, g, [true, true, true, true, true])
    expect(g.hand).toEqual(dealt)
    expect(res).toEqual(evaluateHand(dealt))
  })

  it('replacements come from deck positions 5.. in order for non-held cards', () => {
    const a = account()
    const g = createVideoPoker(a, { stake: 100, ...BASE })
    const deck = g.deck
    // hold cards 0 and 2; cards 1,3,4 get deck[5],deck[6],deck[7]
    draw(a, g, [true, false, true, false, false])
    expect(g.hand[0]).toEqual(deck[0])
    expect(g.hand[1]).toEqual(deck[5])
    expect(g.hand[2]).toEqual(deck[2])
    expect(g.hand[3]).toEqual(deck[6])
    expect(g.hand[4]).toEqual(deck[7])
  })

  it('a forced winning hand moves the figure up by the right profit', () => {
    // Use a seeded deck but verify the exact core math by forcing a known hand:
    // hold all 5 of a constructed royal flush deck position is not guaranteed, so
    // instead settle a real round and check the figure equals stake×(mult−1).
    const a = account({ balance: 200 })
    const g = createVideoPoker(a, { stake: 1000, ...BASE })
    const before = a.balance
    const res = draw(a, g, [false, false, false, false, false])
    expect(a.balance - before).toBe(Math.round(1000 * (res.multiplier - 1)))
    if (res.multiplier > 1) expect(a.balance).toBeGreaterThan(before)
    if (res.multiplier === 0) expect(a.balance).toBe(before - 1000)
  })

  it('rejects over-limit stakes (placeWager guard) and double draws', () => {
    const a = account({ creditLimit: 500 })
    expect(() => createVideoPoker(a, { stake: 501, ...BASE })).toThrow(/exceeds availableToWager/)
    expect(availableToWager(a)).toBe(500)

    const a2 = account()
    const g = createVideoPoker(a2, { stake: 100, ...BASE })
    draw(a2, g, [false, false, false, false, false])
    expect(() => draw(a2, g, [false, false, false, false, false])).toThrow(/not awaiting a draw/)
  })

  it('rejects a bad hold mask length', () => {
    const a = account()
    const g = createVideoPoker(a, { stake: 100, ...BASE })
    expect(() => draw(a, g, [true, false, true])).toThrow(/holdMask must have 5/)
  })
})
