import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playBaccarat, spotOutcome, PAYOUTS, type BaccaratBet } from './engine.js'
import {
  bankerDraws,
  cardValue,
  dealBaccarat,
  handTotal,
  verifyBaccarat,
  SHOE_SIZE,
  type BaccaratCard,
  type BaccaratDeal,
} from './fair.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'bacc-client', nonce: 1, serverSeed: 'bacc-server' } as const
const card = (rank: number, suit = 0): BaccaratCard => ({ rank, suit })

/** Scan nonces (deterministically) for the first deal matching a predicate. */
function findDeal(pred: (d: BaccaratDeal) => boolean, seed = 'find'): { nonce: number; deal: BaccaratDeal } {
  for (let nonce = 1; nonce <= 5000; nonce++) {
    const deal = dealBaccarat(seed, 'c', nonce)
    if (pred(deal)) return { nonce, deal }
  }
  throw new Error('no matching deal found in 5000 nonces')
}

describe('cardValue / handTotal', () => {
  it('values Ace=1, 2-9 face, 10/J/Q/K=0', () => {
    expect(cardValue(1)).toBe(1)
    expect(cardValue(9)).toBe(9)
    expect([10, 11, 12, 13].map(cardValue)).toEqual([0, 0, 0, 0])
  })

  it('totals are mod 10', () => {
    expect(handTotal([card(7), card(8)])).toBe(5) // 15 → 5
    expect(handTotal([card(10), card(13)])).toBe(0)
    expect(handTotal([card(4), card(5)])).toBe(9)
    expect(handTotal([card(6), card(6), card(9)])).toBe(1) // 21 → 1
  })
})

describe('bankerDraws — the standard third-card tableau', () => {
  it('Player stood (no third card): Banker draws 0-5, stands 6-7', () => {
    for (let b = 0; b <= 5; b++) expect(bankerDraws(b, null)).toBe(true)
    expect(bankerDraws(6, null)).toBe(false)
    expect(bankerDraws(7, null)).toBe(false)
  })
  it('Banker 0-2 always draws regardless of Player third', () => {
    for (let t = 0; t <= 9; t++) {
      expect(bankerDraws(0, t)).toBe(true)
      expect(bankerDraws(1, t)).toBe(true)
      expect(bankerDraws(2, t)).toBe(true)
    }
  })
  it('Banker 3 draws unless Player third is 8', () => {
    expect(bankerDraws(3, 8)).toBe(false)
    for (const t of [0, 1, 2, 3, 4, 5, 6, 7, 9]) expect(bankerDraws(3, t)).toBe(true)
  })
  it('Banker 4 draws on Player third 2-7', () => {
    for (const t of [2, 3, 4, 5, 6, 7]) expect(bankerDraws(4, t)).toBe(true)
    for (const t of [0, 1, 8, 9]) expect(bankerDraws(4, t)).toBe(false)
  })
  it('Banker 5 draws on Player third 4-7', () => {
    for (const t of [4, 5, 6, 7]) expect(bankerDraws(5, t)).toBe(true)
    for (const t of [0, 1, 2, 3, 8, 9]) expect(bankerDraws(5, t)).toBe(false)
  })
  it('Banker 6 draws on Player third 6-7', () => {
    for (const t of [6, 7]) expect(bankerDraws(6, t)).toBe(true)
    for (const t of [0, 1, 2, 3, 4, 5, 8, 9]) expect(bankerDraws(6, t)).toBe(false)
  })
  it('Banker 7 always stands', () => {
    for (let t = 0; t <= 9; t++) expect(bankerDraws(7, t)).toBe(false)
  })
})

describe('dealBaccarat — 8-deck shoe', () => {
  it('uses a 416-card shoe', () => {
    expect(SHOE_SIZE).toBe(416)
  })

  it('is deterministic in the seeds and verifies', () => {
    const a = dealBaccarat(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    const b = dealBaccarat(BASE.serverSeed, BASE.clientSeed, BASE.nonce)
    expect(a).toEqual(b)
    expect(verifyBaccarat(BASE.serverSeed, BASE.clientSeed, BASE.nonce, a)).toBe(true)
  })

  it('different nonces / client seeds give different deals', () => {
    const a = dealBaccarat('s', 'c', 1)
    const b = dealBaccarat('s', 'c', 2)
    const c = dealBaccarat('s', 'd', 1)
    expect(a).not.toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('produces valid hands: 2-3 cards each, totals 0-9, a consistent winner', () => {
    for (let nonce = 1; nonce <= 300; nonce++) {
      const d = dealBaccarat('seed', 'client', nonce)
      expect(d.player.length).toBeGreaterThanOrEqual(2)
      expect(d.player.length).toBeLessThanOrEqual(3)
      expect(d.banker.length).toBeGreaterThanOrEqual(2)
      expect(d.banker.length).toBeLessThanOrEqual(3)
      expect(d.playerTotal).toBe(handTotal(d.player))
      expect(d.bankerTotal).toBe(handTotal(d.banker))
      if (d.playerTotal > d.bankerTotal) expect(d.winner).toBe('player')
      else if (d.bankerTotal > d.playerTotal) expect(d.winner).toBe('banker')
      else expect(d.winner).toBe('tie')
      for (const c of [...d.player, ...d.banker]) {
        expect(c.rank).toBeGreaterThanOrEqual(1)
        expect(c.rank).toBeLessThanOrEqual(13)
        expect(c.suit).toBeGreaterThanOrEqual(0)
        expect(c.suit).toBeLessThanOrEqual(3)
      }
    }
  })

  it('a natural (8/9 on two cards) stands both hands', () => {
    const { deal } = findDeal((d) => handTotal(d.player.slice(0, 2)) >= 8 || handTotal(d.banker.slice(0, 2)) >= 8, 'nat')
    expect(deal.player.length).toBe(2)
    expect(deal.banker.length).toBe(2)
  })

  it('pair flags match the first two cards sharing a rank', () => {
    for (let nonce = 1; nonce <= 300; nonce++) {
      const d = dealBaccarat('pairs', 'c', nonce)
      expect(d.playerPair).toBe(d.player[0].rank === d.player[1].rank)
      expect(d.bankerPair).toBe(d.banker[0].rank === d.banker[1].rank)
    }
  })

  it('finds genuine player and banker pairs', () => {
    expect(findDeal((d) => d.playerPair, 'pp').deal.player[0].rank).toBe(
      findDeal((d) => d.playerPair, 'pp').deal.player[1].rank,
    )
    expect(findDeal((d) => d.bankerPair, 'bp').deal.banker[0].rank).toBe(
      findDeal((d) => d.bankerPair, 'bp').deal.banker[1].rank,
    )
  })
})

describe('spotOutcome — per-spot resolution', () => {
  const dealWith = (over: Partial<BaccaratDeal>): BaccaratDeal => ({
    player: [card(1), card(2)],
    banker: [card(3), card(4)],
    playerTotal: 3,
    bankerTotal: 7,
    winner: 'banker',
    playerPair: false,
    bankerPair: false,
    ...over,
  })

  it('player wins/pushes/loses correctly', () => {
    expect(spotOutcome('player', dealWith({ winner: 'player' }))).toEqual({ outcome: 'win', multiplier: 2 })
    expect(spotOutcome('player', dealWith({ winner: 'tie' }))).toEqual({ outcome: 'push', multiplier: 1 })
    expect(spotOutcome('player', dealWith({ winner: 'banker' }))).toEqual({ outcome: 'loss', multiplier: 0 })
  })
  it('banker wins at 1.95, pushes on tie', () => {
    expect(spotOutcome('banker', dealWith({ winner: 'banker' }))).toEqual({ outcome: 'win', multiplier: 1.95 })
    expect(spotOutcome('banker', dealWith({ winner: 'tie' }))).toEqual({ outcome: 'push', multiplier: 1 })
  })
  it('tie wins at 9, loses otherwise (no push)', () => {
    expect(spotOutcome('tie', dealWith({ winner: 'tie' }))).toEqual({ outcome: 'win', multiplier: 9 })
    expect(spotOutcome('tie', dealWith({ winner: 'player' }))).toEqual({ outcome: 'loss', multiplier: 0 })
  })
  it('pairs win at 12 on a pair, resolve independently of the winner', () => {
    expect(spotOutcome('playerPair', dealWith({ playerPair: true, winner: 'tie' }))).toEqual({ outcome: 'win', multiplier: 12 })
    expect(spotOutcome('playerPair', dealWith({ playerPair: false }))).toEqual({ outcome: 'loss', multiplier: 0 })
    expect(spotOutcome('bankerPair', dealWith({ bankerPair: true }))).toEqual({ outcome: 'win', multiplier: 12 })
  })
})

describe('playBaccarat — settlement through core', () => {
  // Find a nonce whose deal matches a predicate, then play given bets on it.
  function play(bets: Partial<Record<BaccaratBet, number>>, pred: (d: BaccaratDeal) => boolean) {
    const { nonce } = findDeal(pred, 'settle')
    const a = account()
    const r = playBaccarat(a, { bets, clientSeed: 'c', nonce, serverSeed: 'settle' })
    return { a, r }
  }

  it('Player bet wins at 2× (1:1)', () => {
    const { a, r } = play({ player: 1000 }, (d) => d.winner === 'player')
    expect(r.results[0]).toMatchObject({ bet: 'player', outcome: 'win', multiplier: 2, returned: 2000, profit: 1000 })
    expect(r.totalProfit).toBe(1000)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(1000)
  })

  it('Banker bet wins at 1.95× via the 5% commission', () => {
    const { a, r } = play({ banker: 1000 }, (d) => d.winner === 'banker')
    expect(r.results[0]).toMatchObject({ bet: 'banker', outcome: 'win', multiplier: PAYOUTS.banker, returned: 1950 })
    expect(a.balance).toBe(950)
  })

  it('Tie bet wins at 9× (8:1)', () => {
    const { a, r } = play({ tie: 1000 }, (d) => d.winner === 'tie')
    expect(r.results[0]).toMatchObject({ outcome: 'win', multiplier: 9, returned: 9000 })
    expect(a.balance).toBe(8000)
  })

  it('on a tie, a Player/Banker bet PUSHES (stake returned)', () => {
    const { a, r } = play({ player: 1000 }, (d) => d.winner === 'tie')
    expect(r.results[0]).toMatchObject({ outcome: 'push', multiplier: 1, returned: 1000, profit: 0 })
    expect(a.balance).toBe(0)
  })

  it('a losing bet loses the stake', () => {
    const { a, r } = play({ player: 1000 }, (d) => d.winner === 'banker')
    expect(r.results[0]).toMatchObject({ outcome: 'loss', multiplier: 0, returned: 0, profit: -1000 })
    expect(a.balance).toBe(-1000)
  })

  it('Player Pair pays 11:1 (12× return)', () => {
    const { a, r } = play({ playerPair: 1000 }, (d) => d.playerPair)
    expect(r.results[0]).toMatchObject({ bet: 'playerPair', outcome: 'win', multiplier: 12, returned: 12000 })
    expect(a.balance).toBe(11000)
  })

  it('settles MANY spots in one round and nets correctly', () => {
    // Banker wins + a banker pair: back banker (win 1.95) and bankerPair (win 12),
    // plus a losing player bet — all in one round, one net settlement.
    const { a, r } = play(
      { banker: 1000, bankerPair: 200, player: 500 },
      (d) => d.winner === 'banker' && d.bankerPair,
    )
    const byBet = Object.fromEntries(r.results.map((x) => [x.bet, x]))
    expect(byBet.banker.returned).toBe(1950)
    expect(byBet.bankerPair.returned).toBe(2400) // 200 × 12
    expect(byBet.player.returned).toBe(0)
    expect(r.totalStake).toBe(1700)
    expect(r.totalReturn).toBe(4350)
    expect(r.totalProfit).toBe(2650)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(2650) // net change matches totalProfit exactly
  })

  it('rejects an empty bet set', () => {
    expect(() => playBaccarat(account(), { bets: {}, ...BASE })).toThrow(/at least one bet/)
  })

  it('rejects an over-limit total stake', () => {
    const a = account({ creditLimit: 500 })
    expect(() =>
      playBaccarat(a, { bets: { player: 300, banker: 300 }, clientSeed: 'c', nonce: 1, serverSeed: 's' }),
    ).toThrow(/exceeds what you can wager/)
    expect(availableToWager(a)).toBe(500) // nothing was held
  })

  it('exposes a verifiable, hashed-committed deal', () => {
    const r = playBaccarat(account(), { bets: { banker: 500 }, ...BASE })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyBaccarat(r.serverSeed, r.clientSeed, r.nonce, r.deal)).toBe(true)
  })
})

describe('realized distribution (deterministic Monte Carlo)', () => {
  it('Player/Banker/Tie/Pair rates land near the published 8-deck figures', () => {
    const N = 6000
    let player = 0,
      banker = 0,
      tie = 0,
      pPair = 0,
      bPair = 0
    for (let nonce = 1; nonce <= N; nonce++) {
      const d = dealBaccarat('mc-seed', 'mc-client', nonce)
      if (d.winner === 'player') player++
      else if (d.winner === 'banker') banker++
      else tie++
      if (d.playerPair) pPair++
      if (d.bankerPair) bPair++
    }
    // published 8-deck: Player ≈ 0.4462, Banker ≈ 0.4586, Tie ≈ 0.0952, Pair ≈ 0.0747
    expect(player / N).toBeCloseTo(0.4462, 1) // within ±0.05; really lands ~±0.02
    expect(banker / N).toBeCloseTo(0.4586, 1)
    expect(tie / N).toBeCloseTo(0.0952, 1)
    expect(pPair / N).toBeCloseTo(0.0747, 1)
    expect(bPair / N).toBeCloseTo(0.0747, 1)
    // Banker wins slightly more often than Player (the reason for the commission).
    expect(banker).toBeGreaterThan(player)
  })
})
