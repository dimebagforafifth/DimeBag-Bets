import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playRoulette, type RouletteBet } from './engine.js'
import { spinPocket, verifySpin } from './fair.js'
import { colorOf, column, dozen, payoutFor, RED_NUMBERS } from './table.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000, balance: 0, pending: 0, ...overrides }
}

const SEEDS = { clientSeed: 'rl-client', serverSeed: 'rl-server' }

/** Find a nonce whose pocket satisfies a predicate, so tests are outcome-driven. */
function nonceWhere(pred: (pocket: number) => boolean): number {
  for (let n = 1; n < 10000; n++) {
    if (pred(spinPocket(SEEDS.serverSeed, SEEDS.clientSeed, n))) return n
  }
  throw new Error('no matching pocket found')
}

describe('payoutFor', () => {
  it('matches the classic fair prices', () => {
    expect(payoutFor(1)).toBe(36) // straight up, 35:1
    expect(payoutFor(2)).toBe(18) // split
    expect(payoutFor(3)).toBe(12) // street
    expect(payoutFor(12)).toBe(3) // dozen/column, 2:1
    expect(payoutFor(18)).toBe(2) // even-money
  })
})

describe('playRoulette', () => {
  it('pays a straight-up hit at 36× and settles through core', () => {
    const nonce = nonceWhere((p) => p === 17)
    const a = account()
    const bets: RouletteBet[] = [{ label: '17', numbers: [17], stake: 1000 }]
    const r = playRoulette(a, { bets, nonce, ...SEEDS })
    expect(r.pocket).toBe(17)
    expect(r.returned).toBe(36000)
    expect(r.profit).toBe(35000)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(35000)
  })

  it('loses the stake when no bet covers the pocket', () => {
    const nonce = nonceWhere((p) => p !== 17)
    const a = account()
    const r = playRoulette(a, { bets: [{ label: '17', numbers: [17], stake: 1000 }], nonce, ...SEEDS })
    expect(r.returned).toBe(0)
    expect(r.profit).toBe(-1000)
    expect(a.balance).toBe(-1000)
  })

  it('settles the blended net across several simultaneous bets', () => {
    // a non-zero pocket: red/black + even/odd + a dozen each pay or miss.
    const nonce = nonceWhere((p) => p !== 0)
    const pocket = spinPocket(SEEDS.serverSeed, SEEDS.clientSeed, nonce)
    const a = account()
    const bets: RouletteBet[] = [
      { label: 'Red', numbers: [...RED_NUMBERS], stake: 1000 },
      { label: '1st 12', numbers: dozen(1), stake: 1000 },
      { label: 'Col 1', numbers: column(1), stake: 1000 },
    ]
    const r = playRoulette(a, { bets, nonce, ...SEEDS })

    let expected = 0
    if (colorOf(pocket) === 'red') expected += 2000
    if (dozen(1).includes(pocket)) expected += 3000
    if (column(1).includes(pocket)) expected += 3000
    expect(r.totalStake).toBe(3000)
    expect(r.returned).toBe(expected)
    expect(a.balance).toBe(expected - 3000)
  })

  it('rejects empty bets and over-limit total stakes', () => {
    expect(() => playRoulette(account(), { bets: [], nonce: 1, ...SEEDS })).toThrow(/at least one/)
    const a = account({ creditLimit: 500 })
    expect(() =>
      playRoulette(a, { bets: [{ label: 'Red', numbers: [1], stake: 600 }], nonce: 1, ...SEEDS }),
    ).toThrow(/exceeds availableToWager/)
    expect(availableToWager(a)).toBe(500)
  })

  it('exposes a verifiable spin', () => {
    const r = playRoulette(account(), {
      bets: [{ label: 'Red', numbers: [...RED_NUMBERS], stake: 100 }],
      nonce: 3,
      ...SEEDS,
    })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifySpin(r.serverSeed, r.clientSeed, r.nonce, r.pocket)).toBe(true)
  })
})
