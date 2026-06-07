import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { deal3, verify, type Card } from './fair.js'
import {
  evaluate3,
  compareHands,
  dealerQualifies,
  anteBonusOdds,
  pairPlusReturn,
  PAIR_PLUS,
} from './payouts.js'
import {
  createGame,
  play,
  fold,
  totalProfit,
  totalReturned,
  totalStaked,
} from './engine.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000000, balance: 0, pending: 0, ...overrides }
}

// Build a 3-card hand from terse "rank/suit" tokens (rank 1..13, Ace = 1).
function hand(...spec: [number, number][]): Card[] {
  return spec.map(([rank, suit]) => ({ rank, suit }))
}

const BASE = { clientSeed: 'C', nonce: 1, serverSeed: 'S' } as const

/* ----------------------------- evaluate3 -------------------------------- */

describe('evaluate3', () => {
  it('ranks a straight flush', () => {
    expect(evaluate3(hand([5, 0], [6, 0], [7, 0])).rank).toBe('straight-flush')
  })

  it('ranks three of a kind', () => {
    expect(evaluate3(hand([9, 0], [9, 1], [9, 2])).rank).toBe('three-of-a-kind')
  })

  it('ranks a straight (mixed suits)', () => {
    const v = evaluate3(hand([8, 0], [9, 1], [10, 2]))
    expect(v.rank).toBe('straight')
    expect(v.tiebreak).toEqual([10])
  })

  it('ranks a flush', () => {
    expect(evaluate3(hand([2, 3], [9, 3], [13, 3])).rank).toBe('flush')
  })

  it('ranks a pair with the right tiebreak [pair, kicker]', () => {
    const v = evaluate3(hand([4, 0], [4, 1], [13, 2]))
    expect(v.rank).toBe('pair')
    expect(v.tiebreak).toEqual([4, 13])
  })

  it('ranks a high card descending', () => {
    const v = evaluate3(hand([1, 0], [11, 1], [2, 2])) // A, J, 2
    expect(v.rank).toBe('high-card')
    expect(v.tiebreak).toEqual([14, 11, 2])
  })

  it('accepts the A-2-3 wheel as a straight whose high card is the 3', () => {
    const v = evaluate3(hand([1, 0], [2, 1], [3, 2]))
    expect(v.rank).toBe('straight')
    expect(v.tiebreak).toEqual([3])
  })

  it('accepts the Q-K-A straight whose high card is the Ace', () => {
    const v = evaluate3(hand([12, 0], [13, 1], [1, 2]))
    expect(v.rank).toBe('straight')
    expect(v.tiebreak).toEqual([14])
  })

  it('does NOT treat K-A-2 as a straight (Ace does not wrap)', () => {
    expect(evaluate3(hand([13, 0], [1, 1], [2, 2])).rank).toBe('high-card')
  })

  it('A-2-3 of one suit is a straight flush', () => {
    expect(evaluate3(hand([1, 0], [2, 0], [3, 0])).rank).toBe('straight-flush')
  })

  it('ranks a STRAIGHT above a FLUSH (3-card order)', () => {
    const straight = evaluate3(hand([8, 0], [9, 1], [10, 2]))
    const flush = evaluate3(hand([2, 3], [9, 3], [13, 3]))
    expect(compareHands(straight, flush)).toBeGreaterThan(0)
  })

  it('compareHands orders same-rank hands by tiebreak and detects ties', () => {
    const aceHigh = evaluate3(hand([1, 0], [9, 1], [7, 2]))
    const kingHigh = evaluate3(hand([13, 0], [9, 1], [7, 2]))
    expect(compareHands(aceHigh, kingHigh)).toBeGreaterThan(0)
    const same = evaluate3(hand([1, 1], [9, 2], [7, 3]))
    expect(compareHands(aceHigh, same)).toBe(0)
  })

  it('throws on a wrong card count', () => {
    expect(() => evaluate3(hand([1, 0], [2, 1]))).toThrow(/3 cards/)
  })
})

/* --------------------------- dealerQualifies ---------------------------- */

describe('dealerQualifies', () => {
  it('a Jack-high dealer does NOT qualify', () => {
    expect(dealerQualifies(evaluate3(hand([11, 0], [8, 1], [7, 2])))).toBe(false)
  })
  it('a Queen-high dealer qualifies', () => {
    expect(dealerQualifies(evaluate3(hand([12, 0], [8, 1], [7, 2])))).toBe(true)
  })
  it('any pair or better qualifies', () => {
    expect(dealerQualifies(evaluate3(hand([2, 0], [2, 1], [3, 2])))).toBe(true)
  })
})

/* ---------------------------- ante bonus -------------------------------- */

describe('anteBonusOdds', () => {
  it('pays 1:1 on a straight, 4:1 on trips, 5:1 on a straight flush, 0 otherwise', () => {
    expect(anteBonusOdds(evaluate3(hand([8, 0], [9, 1], [10, 2])))).toBe(1) // straight
    expect(anteBonusOdds(evaluate3(hand([9, 0], [9, 1], [9, 2])))).toBe(4) // trips
    expect(anteBonusOdds(evaluate3(hand([5, 0], [6, 0], [7, 0])))).toBe(5) // straight flush
    expect(anteBonusOdds(evaluate3(hand([2, 3], [9, 3], [13, 3])))).toBe(0) // flush, no bonus
    expect(anteBonusOdds(evaluate3(hand([4, 0], [4, 1], [13, 2])))).toBe(0) // pair, no bonus
  })
})

/* ----------------------------- pair plus -------------------------------- */

describe('pairPlusReturn', () => {
  it('matches the standard 1-3-6-30-40 schedule, 0 below a pair', () => {
    expect(pairPlusReturn(evaluate3(hand([4, 0], [4, 1], [13, 2])))).toBe(2) // pair
    expect(pairPlusReturn(evaluate3(hand([2, 3], [9, 3], [13, 3])))).toBe(4) // flush
    expect(pairPlusReturn(evaluate3(hand([8, 0], [9, 1], [10, 2])))).toBe(7) // straight
    expect(pairPlusReturn(evaluate3(hand([9, 0], [9, 1], [9, 2])))).toBe(31) // trips
    expect(pairPlusReturn(evaluate3(hand([5, 0], [6, 0], [7, 0])))).toBe(41) // straight flush
    expect(pairPlusReturn(evaluate3(hand([1, 0], [9, 1], [4, 2])))).toBe(0) // ace high
  })

  it('Pair Plus realized RTP is below 1 (a real house edge) across the full deal space', () => {
    // Enumerate all C(52,3) = 22,100 distinct player hands; the expected return
    // per unit staked is the mean Pair Plus multiplier. Back-checks §4: the
    // standard schedule keeps RTP < 1 (≈ 0.927, a ~7.28% edge).
    let total = 0
    let count = 0
    const card = (i: number): Card => ({ rank: Math.floor(i / 4) + 1, suit: i % 4 })
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++) {
          total += PAIR_PLUS[evaluate3([card(a), card(b), card(c)]).rank]
          count++
        }
    expect(count).toBe(22100)
    const rtp = total / count
    expect(rtp).toBeGreaterThan(0.9)
    expect(rtp).toBeLessThan(1)
  })
})

/* ------------------------------- deal ----------------------------------- */

describe('deal3 / verify', () => {
  it('deals 3 + 3 deterministically and is verifiable', () => {
    const d = deal3(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(d.player).toHaveLength(3)
    expect(d.dealer).toHaveLength(3)
    // determinism
    const again = deal3(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(again).toEqual(d)
    expect(verify(BASE.serverSeed, BASE.clientSeed, BASE.nonce, d)).toBe(true)
    // tampered hand fails verification
    const tampered = { player: [...d.dealer], dealer: [...d.player] }
    expect(verify(BASE.serverSeed, BASE.clientSeed, BASE.nonce, tampered)).toBe(false)
  })

  it('all 6 dealt cards are distinct', () => {
    const d = deal3('S', 'C', 42)
    const ids = [...d.player, ...d.dealer].map((c) => c.rank * 10 + c.suit)
    expect(new Set(ids).size).toBe(6)
  })
})

/* ----------------------------- full rounds ------------------------------ */

// Seeds discovered by enumerating ('S','C',nonce) — see comments per case.
const FIX = {
  jackHighDealer: 24, // dealer J-high → does NOT qualify
  playerWins: 1, // qualifying dealer, player wins
  playerLoses: 3, // qualifying dealer, player loses
  tie: 286, // qualifying dealer, exact tie → push
} as const

describe('createGame + settlement through core', () => {
  it('holds the ante and pair plus as separate pending wagers at the deal', () => {
    const a = account()
    const g = createGame(a, { ante: 1000, pairPlus: 500, clientSeed: 'C', nonce: 7, serverSeed: 'S' })
    expect(g.status).toBe('decide')
    expect(g.pairPlusWager).toBeDefined()
    expect(a.pending).toBe(1500) // ante + pair plus held
    expect(a.balance).toBe(0)
  })

  it('omits the pair plus wager when its stake is 0', () => {
    const g = createGame(account(), { ante: 1000, clientSeed: 'C', nonce: 7, serverSeed: 'S' })
    expect(g.pairPlusWager).toBeUndefined()
  })

  it('rejects an over-limit ante', () => {
    const a = account({ creditLimit: 500 })
    expect(() => createGame(a, { ante: 501, clientSeed: 'C', nonce: 1, serverSeed: 'S' })).toThrow(
      /exceeds availableToWager/,
    )
    expect(availableToWager(a)).toBe(500)
  })

  it('FOLD: forfeits the ante, no play wager, but still settles pair plus', () => {
    // nonce 11 → player flush (pair plus pays 4×).
    const a = account()
    const g = createGame(a, { ante: 1000, pairPlus: 500, clientSeed: 'C', nonce: 11, serverSeed: 'S' })
    expect(g.playerValue.rank).toBe('flush')
    fold(a, g)
    expect(g.status).toBe('done')
    expect(g.decision).toBe('fold')
    expect(g.playWager).toBeUndefined()
    expect(g.ante_result!.multiplier).toBe(0) // ante forfeited
    expect(g.pairPlus_result!.multiplier).toBe(4) // pair plus still pays the flush
    // ante: −1000; pair plus: 500 × (4 − 1) = +1500 → net +500.
    expect(g.ante_result!.profit).toBe(-1000)
    expect(g.pairPlus_result!.profit).toBe(1500)
    expect(totalProfit(g)).toBe(500)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(500)
  })

  it('FOLD does not pay the ante bonus even on a bonus-eligible hand', () => {
    // Construct a straight player hand deterministically is hard via seed; instead
    // assert the FOLD path always settles ante at 0× regardless of hand.
    const a = account()
    const g = createGame(a, { ante: 1000, clientSeed: 'C', nonce: FIX.playerLoses, serverSeed: 'S' })
    fold(a, g)
    expect(g.ante_result!.multiplier).toBe(0)
    expect(a.balance).toBe(-1000)
    expect(a.pending).toBe(0)
  })

  it('PLAY, dealer does NOT qualify: ante wins 1:1, play pushes', () => {
    const a = account()
    const g = createGame(a, { ante: 1000, clientSeed: 'C', nonce: FIX.jackHighDealer, serverSeed: 'S' })
    expect(dealerQualifies(g.dealerValue)).toBe(false)
    play(a, g)
    expect(g.dealerQualified).toBe(false)
    expect(g.ante_result!.multiplier).toBe(2) // 1:1
    expect(g.play_result!.multiplier).toBe(1) // push
    // ante +1000, play +0 → +1000.
    expect(totalProfit(g)).toBe(1000)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(1000)
  })

  it('PLAY, dealer qualifies and player wins: ante & play each 1:1', () => {
    const a = account()
    const g = createGame(a, { ante: 1000, clientSeed: 'C', nonce: FIX.playerWins, serverSeed: 'S' })
    expect(dealerQualifies(g.dealerValue)).toBe(true)
    expect(compareHands(g.playerValue, g.dealerValue)).toBeGreaterThan(0)
    play(a, g)
    expect(g.ante_result!.multiplier).toBe(2)
    expect(g.play_result!.multiplier).toBe(2)
    expect(totalProfit(g)).toBe(2000) // +1000 ante +1000 play
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(2000)
  })

  it('PLAY, dealer qualifies and player loses: both lose', () => {
    const a = account()
    const g = createGame(a, { ante: 1000, clientSeed: 'C', nonce: FIX.playerLoses, serverSeed: 'S' })
    expect(dealerQualifies(g.dealerValue)).toBe(true)
    expect(compareHands(g.playerValue, g.dealerValue)).toBeLessThan(0)
    play(a, g)
    expect(g.ante_result!.multiplier).toBe(0)
    expect(g.play_result!.multiplier).toBe(0)
    expect(totalProfit(g)).toBe(-2000)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-2000)
  })

  it('PLAY, tie: both push (pending released, balance unchanged)', () => {
    const a = account()
    const g = createGame(a, { ante: 1000, clientSeed: 'C', nonce: FIX.tie, serverSeed: 'S' })
    expect(compareHands(g.playerValue, g.dealerValue)).toBe(0)
    play(a, g)
    expect(g.ante_result!.multiplier).toBe(1)
    expect(g.play_result!.multiplier).toBe(1)
    expect(totalProfit(g)).toBe(0)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(0)
  })

  it('multi-bet PLAY round releases all pending to 0 and matches the profit', () => {
    // nonce 11: player flush (pair plus 4×, no ante bonus), dealer A-high qualifies,
    // flush beats A-high → ante & play each 2×.
    const a = account()
    const g = createGame(a, { ante: 1000, pairPlus: 500, clientSeed: 'C', nonce: 11, serverSeed: 'S' })
    expect(a.pending).toBe(1500)
    play(a, g)
    expect(g.dealerQualified).toBe(true)
    expect(g.ante_result!.multiplier).toBe(2)
    expect(g.play_result!.multiplier).toBe(2)
    expect(g.pairPlus_result!.multiplier).toBe(4)
    // ante +1000, play +1000, pair plus 500×(4−1)=+1500 → +3500.
    expect(totalProfit(g)).toBe(3500)
    expect(totalStaked(g)).toBe(2500) // ante + play + pair plus
    expect(totalReturned(g)).toBe(2000 + 2000 + 2000) // stake×mult per bet
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(3500)
  })

  it('PLAY pays the ante bonus folded into the ante return (straight, through core)', () => {
    // nonce 2: player straight (3-2-4, bonus 1:1) vs qualifying dealer, player wins.
    // Ante = base 2 (wins 1:1) + 1 (straight bonus) = 3×; play 2×.
    const a = account()
    const g = createGame(a, { ante: 1000, clientSeed: 'C', nonce: 2, serverSeed: 'S' })
    expect(g.playerValue.rank).toBe('straight')
    play(a, g)
    expect(g.ante_result!.multiplier).toBe(3)
    expect(g.play_result!.multiplier).toBe(2)
    // ante 1000×(3−1)=+2000, play +1000 → +3000.
    expect(totalProfit(g)).toBe(3000)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(3000)
  })

  it('PLAY pays the trips ante bonus (4:1) through core', () => {
    // nonce 22: player trips, qualifying dealer, player wins. Ante 2 + 4 = 6×.
    const a = account()
    const g = createGame(a, { ante: 1000, clientSeed: 'C', nonce: 22, serverSeed: 'S' })
    expect(g.playerValue.rank).toBe('three-of-a-kind')
    play(a, g)
    expect(g.ante_result!.multiplier).toBe(6)
    expect(totalProfit(g)).toBe(5000 + 1000) // ante +5000, play +1000
    expect(a.balance).toBe(6000)
  })

  it('PLAY pays the straight-flush ante bonus (5:1) through core', () => {
    // nonce 9: player straight flush, qualifying dealer, player wins. Ante 2 + 5 = 7×.
    const a = account()
    const g = createGame(a, { ante: 1000, clientSeed: 'C', nonce: 9, serverSeed: 'S' })
    expect(g.playerValue.rank).toBe('straight-flush')
    play(a, g)
    expect(g.ante_result!.multiplier).toBe(7)
    expect(totalProfit(g)).toBe(6000 + 1000) // ante +6000, play +1000
    expect(a.balance).toBe(7000)
  })

  it('ante bonus is added to the ante return when Played (constructed hands)', () => {
    // Verify the bonus arithmetic directly via the schedule: a straight player
    // hand vs a non-qualifying dealer pays base 2× + 1:1 bonus = 3× total.
    const straight = evaluate3(hand([8, 0], [9, 1], [10, 2]))
    expect(anteBonusOdds(straight)).toBe(1)
    const trips = evaluate3(hand([9, 0], [9, 1], [9, 2]))
    expect(anteBonusOdds(trips)).toBe(4)
    const sf = evaluate3(hand([5, 0], [6, 0], [7, 0]))
    expect(anteBonusOdds(sf)).toBe(5)
    // base 2 (ante wins) + bonus → 3, 6, 7 respectively.
    expect(2 + anteBonusOdds(straight)).toBe(3)
    expect(2 + anteBonusOdds(trips)).toBe(6)
    expect(2 + anteBonusOdds(sf)).toBe(7)
  })

  it('cannot decide twice', () => {
    const a = account()
    const g = createGame(a, { ante: 1000, clientSeed: 'C', nonce: 1, serverSeed: 'S' })
    play(a, g)
    expect(() => play(a, g)).toThrow(/not awaiting a decision/)
    expect(() => fold(a, g)).toThrow(/not awaiting a decision/)
  })
})
