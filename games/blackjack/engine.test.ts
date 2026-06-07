import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import {
  createBlackjackGame,
  declineInsurance,
  double,
  hit,
  insuranceBet,
  offersInsurance,
  stand,
  split,
  canSplit,
  takeInsurance,
  totalReturned,
} from './engine.js'
import { cardValue, handValue, isBlackjack } from './cards.js'
import { shuffleDeck } from './fair.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000, balance: 0, pending: 0, ...overrides }
}

const SEEDS = { clientSeed: 'bj-client', serverSeed: 'bj-server' }

/** The opening player/dealer hands a nonce would deal (no side effects). */
function deal(nonce: number) {
  const d = shuffleDeck(SEEDS.serverSeed, SEEDS.clientSeed, nonce)
  return { player: [d[0], d[2]], dealer: [d[1], d[3]], third: d[4] }
}

/** First nonce whose opening deal matches a predicate. */
function nonceWhere(pred: (h: ReturnType<typeof deal>) => boolean): number {
  for (let n = 1; n < 20000; n++) if (pred(deal(n))) return n
  throw new Error('no matching deal found')
}

describe('createBlackjackGame', () => {
  it('deals two cards each and holds the stake', () => {
    const nonce = nonceWhere((h) => !isBlackjack(h.player) && !isBlackjack(h.dealer))
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })
    expect(g.hands).toHaveLength(1)
    expect(g.hands[0].cards).toHaveLength(2)
    expect(g.dealer).toHaveLength(2)
    expect(g.status).toBe('player')
    expect(a.pending).toBe(1000)
    expect(a.balance).toBe(0)
  })

  it('pays a natural blackjack 3:2 and settles at once', () => {
    const nonce = nonceWhere((h) => isBlackjack(h.player) && !isBlackjack(h.dealer))
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })
    expect(g.status).toBe('settled')
    expect(g.hands[0].result).toBe('blackjack')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(1500) // 3:2 profit on 1000
    expect(totalReturned(g)).toBe(2500)
  })

  it('pushes when both have blackjack', () => {
    const nonce = nonceWhere((h) => isBlackjack(h.player) && isBlackjack(h.dealer))
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })
    expect(g.hands[0].result).toBe('push')
    expect(a.balance).toBe(0)
    expect(a.pending).toBe(0)
  })
})

describe('player actions', () => {
  it('hit to a bust loses the stake', () => {
    const nonce = nonceWhere(
      (h) =>
        !isBlackjack(h.player) &&
        !isBlackjack(h.dealer) &&
        handValue([...h.player, h.third]).total > 21,
    )
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })
    hit(a, g)
    expect(g.status).toBe('settled')
    expect(g.hands[0].result).toBe('loss')
    expect(a.balance).toBe(-1000)
    expect(a.pending).toBe(0)
  })

  it('stand settles consistently: pending released, figure matches the result', () => {
    const nonce = nonceWhere((h) => !isBlackjack(h.player) && !isBlackjack(h.dealer))
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })
    stand(a, g)
    expect(g.status).toBe('settled')
    expect(a.pending).toBe(0)
    const m = g.hands[0].payoutMultiplier!
    expect(a.balance).toBe(Math.round(1000 * (m - 1)))
    if (g.hands[0].result === 'win') expect(a.balance).toBeGreaterThan(0)
    if (g.hands[0].result === 'loss') expect(a.balance).toBeLessThan(0)
    if (g.hands[0].result === 'push') expect(a.balance).toBe(0)
  })

  it('double places a second equal wager and stakes twice', () => {
    const nonce = nonceWhere((h) => !isBlackjack(h.player) && !isBlackjack(h.dealer))
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })
    double(a, g)
    expect(g.hands[0].doubled).toBe(true)
    expect(g.hands[0].wagers).toHaveLength(2)
    expect(g.status).toBe('settled')
    expect(a.pending).toBe(0)
    const m = g.hands[0].payoutMultiplier!
    expect(a.balance).toBe(Math.round(2000 * (m - 1))) // both wagers settle at m
  })
})

describe('split', () => {
  it('splits a matching pair into two independently-settled hands', () => {
    const nonce = nonceWhere(
      (h) =>
        cardValue(h.player[0].rank) === cardValue(h.player[1].rank) &&
        h.player[0].rank !== 'A' && // aces auto-finish; pick a normal pair
        !isBlackjack(h.dealer),
    )
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })
    expect(canSplit(g)).toBe(true)

    split(a, g)
    expect(g.hands).toHaveLength(2)
    expect(a.pending).toBe(2000) // two base wagers held
    expect(g.hands[0].cards).toHaveLength(2) // each hand drew a fresh card
    expect(g.hands[1].cards).toHaveLength(2)
    expect(g.status).toBe('player')

    stand(a, g) // finish the first hand → turn passes to the second
    expect(g.status).toBe('player')
    expect(g.active).toBe(1)

    stand(a, g) // finish the second → dealer plays, both hands settle
    expect(g.status).toBe('settled')
    expect(a.pending).toBe(0)
    const expected = g.hands.reduce((s, h) => s + Math.round(1000 * (h.payoutMultiplier! - 1)), 0)
    expect(a.balance).toBe(expected)
  })
})

describe('insurance', () => {
  it('offers insurance only when the dealer’s up card is an Ace (half the stake)', () => {
    const aceUp = nonceWhere((h) => h.dealer[0].rank === 'A')
    const g = createBlackjackGame(account(), { stake: 1000, nonce: aceUp, ...SEEDS })
    expect(g.status).toBe('insurance')
    expect(offersInsurance(g)).toBe(true)
    expect(insuranceBet(g)).toBe(500)

    const notAce = nonceWhere(
      (h) => h.dealer[0].rank !== 'A' && !isBlackjack(h.player) && !isBlackjack(h.dealer),
    )
    const g2 = createBlackjackGame(account(), { stake: 1000, nonce: notAce, ...SEEDS })
    expect(offersInsurance(g2)).toBe(false)
    expect(g2.status).toBe('player')
  })

  it('pays insurance 2:1 when the dealer has blackjack (main loses → break-even)', () => {
    const nonce = nonceWhere(
      (h) => h.dealer[0].rank === 'A' && isBlackjack(h.dealer) && !isBlackjack(h.player),
    )
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })
    expect(g.status).toBe('insurance')

    takeInsurance(a, g)
    expect(g.insuranceResult).toBe('won')
    expect(g.status).toBe('settled')
    expect(g.hands[0].result).toBe('loss')
    // insurance won +1000 (2:1 on a 500 bet); the main hand lost −1000 → net 0
    expect(a.balance).toBe(0)
    expect(a.pending).toBe(0)
  })

  it('loses insurance when the dealer has no blackjack, and play continues', () => {
    const nonce = nonceWhere(
      (h) => h.dealer[0].rank === 'A' && !isBlackjack(h.dealer) && !isBlackjack(h.player),
    )
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })

    takeInsurance(a, g)
    expect(g.insuranceResult).toBe('lost')
    expect(g.status).toBe('player') // the hand plays on
    expect(a.balance).toBe(-500) // the insurance side bet is gone
    expect(a.pending).toBe(1000) // the main stake is still at risk
  })

  it('declining insurance places no side bet and proceeds to play', () => {
    const nonce = nonceWhere(
      (h) => h.dealer[0].rank === 'A' && !isBlackjack(h.dealer) && !isBlackjack(h.player),
    )
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })

    declineInsurance(a, g)
    expect(g.insuranceWager).toBeUndefined()
    expect(g.insuranceResult).toBeUndefined()
    expect(g.status).toBe('player')
    expect(a.balance).toBe(0)
    expect(a.pending).toBe(1000)
  })
})

describe('seats (multi-hand)', () => {
  // the 3-seat deal off a nonce (no side effects): right→left, then the dealer
  function deal3(nonce: number) {
    const s = shuffleDeck(SEEDS.serverSeed, SEEDS.clientSeed, nonce)
    return { right: [s[0], s[4]], centre: [s[1], s[5]], left: [s[2], s[6]], dealer: [s[3], s[7]], shoe: s }
  }
  function nonce3Where(pred: (d: ReturnType<typeof deal3>) => boolean): number {
    for (let n = 1; n < 20000; n++) if (pred(deal3(n))) return n
    throw new Error('no matching 3-seat deal')
  }
  const clean = (d: ReturnType<typeof deal3>) =>
    d.dealer[0].rank !== 'A' &&
    !isBlackjack(d.dealer) &&
    !isBlackjack(d.right) &&
    !isBlackjack(d.centre) &&
    !isBlackjack(d.left)

  it('deals one hand per seat, right→left, then the dealer (correct shoe mapping)', () => {
    const nonce = nonce3Where(clean)
    const s = shuffleDeck(SEEDS.serverSeed, SEEDS.clientSeed, nonce)
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, seats: [0, 1, 2], ...SEEDS })

    expect(g.hands).toHaveLength(3)
    expect(g.hands.map((h) => h.seat)).toEqual([2, 1, 0]) // right, centre, left — play order
    // pass 1 = h0,h1,h2,dealer ; pass 2 = h0,h1,h2,dealer
    expect(g.hands[0].cards).toEqual([s[0], s[4]])
    expect(g.hands[1].cards).toEqual([s[1], s[5]])
    expect(g.hands[2].cards).toEqual([s[2], s[6]])
    expect(g.dealer).toEqual([s[3], s[7]])
    expect(a.pending).toBe(3000) // three seats held
    expect(g.status).toBe('player')
    expect(g.active).toBe(0) // play starts at the rightmost seat
  })

  it('plays seats right→left; the dealer waits until every seat is done', () => {
    const nonce = nonce3Where(clean)
    const a = account()
    const g = createBlackjackGame(a, { stake: 1000, nonce, seats: [0, 1, 2], ...SEEDS })

    const dealerAtDeal = g.dealer.length
    stand(a, g) // right seat done
    expect(g.status).toBe('player')
    expect(g.active).toBe(1) // centre next
    stand(a, g)
    expect(g.status).toBe('player')
    expect(g.active).toBe(2) // left next
    expect(g.dealer.length).toBe(dealerAtDeal) // dealer hasn't drawn yet
    stand(a, g) // every seat done → dealer plays once, all settle
    expect(g.status).toBe('settled')
    expect(a.pending).toBe(0)
  })

  it('rejects the round if the combined seat stake is over the limit', () => {
    const a = account({ creditLimit: 2500 })
    expect(() => createBlackjackGame(a, { stake: 1000, nonce: 1, seats: [0, 1, 2], ...SEEDS })).toThrow(
      /exceeds availableToWager/,
    )
    expect(availableToWager(a)).toBe(2500) // nothing stranded in pending
  })
})

describe('guards', () => {
  it('rejects an over-limit stake', () => {
    const a = account({ creditLimit: 500 })
    expect(() => createBlackjackGame(a, { stake: 600, nonce: 1, ...SEEDS })).toThrow(
      /exceeds availableToWager/,
    )
    expect(availableToWager(a)).toBe(500)
  })

  it('refuses to double without funds for the second wager', () => {
    const nonce = nonceWhere((h) => !isBlackjack(h.player) && !isBlackjack(h.dealer))
    const a = account({ creditLimit: 1000 }) // exactly one stake of room
    const g = createBlackjackGame(a, { stake: 1000, nonce, ...SEEDS })
    expect(() => double(a, g)).toThrow(/exceeds availableToWager/)
  })
})
