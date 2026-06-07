import { describe, it, expect } from 'vitest'
import { shuffleDeck, verifyShoe } from './fair.js'

describe('shuffleDeck', () => {
  it('is a full 52-card permutation, deterministic in the seeds', () => {
    const deck = shuffleDeck('s', 'c', 1)
    expect(deck).toHaveLength(52)
    expect(new Set(deck.map((d) => `${d.rank}${d.suit}`)).size).toBe(52)
    // same seeds → same order
    expect(shuffleDeck('s', 'c', 1)).toEqual(deck)
  })

  it('changes order when the nonce changes', () => {
    const a = shuffleDeck('s', 'c', 1)
    const b = shuffleDeck('s', 'c', 2)
    expect(a).not.toEqual(b)
  })
})

describe('verifyShoe', () => {
  it('confirms a genuine deck and rejects a tampered one', () => {
    const deck = shuffleDeck('s', 'c', 9)
    expect(verifyShoe('s', 'c', 9, deck)).toBe(true)
    const swapped = [...deck]
    ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
    expect(verifyShoe('s', 'c', 9, swapped)).toBe(false)
  })
})
