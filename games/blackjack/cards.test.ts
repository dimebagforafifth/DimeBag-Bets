import { describe, it, expect } from 'vitest'
import { freshDeck, handValue, isBlackjack, isBust, type Card } from './cards.js'

const c = (rank: Card['rank'], suit: Card['suit'] = 'spades'): Card => ({ rank, suit })

describe('freshDeck', () => {
  it('is 52 unique cards', () => {
    const deck = freshDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(deck.map((d) => `${d.rank}${d.suit}`)).size).toBe(52)
  })
})

describe('handValue', () => {
  it('counts faces as 10 and number cards at face', () => {
    expect(handValue([c('K'), c('7')]).total).toBe(17)
    expect(handValue([c('9'), c('5')]).total).toBe(14)
  })

  it('keeps an ace soft at 11 when it fits', () => {
    expect(handValue([c('A'), c('6')])).toEqual({ total: 17, soft: true })
  })

  it('reduces aces from 11 to 1 to avoid busting', () => {
    expect(handValue([c('A'), c('6'), c('K')])).toEqual({ total: 17, soft: false })
    expect(handValue([c('A'), c('A'), c('9')])).toEqual({ total: 21, soft: true })
  })
})

describe('isBlackjack / isBust', () => {
  it('detects a two-card 21 only', () => {
    expect(isBlackjack([c('A'), c('K')])).toBe(true)
    expect(isBlackjack([c('A'), c('5'), c('5')])).toBe(false) // 21 but 3 cards
  })
  it('detects busts over 21', () => {
    expect(isBust([c('K'), c('Q'), c('5')])).toBe(true)
    expect(isBust([c('K'), c('Q')])).toBe(false)
  })
})
