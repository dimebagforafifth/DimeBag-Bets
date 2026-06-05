import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import {
  createCrashGame,
  cashOut,
  crashRound,
  revealProof,
} from './engine.js'
import { crashPointFromSeeds, verifyCrashPoint, type CrashHouseConfig } from './fair.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 1000, balance: 0, pending: 0, ...overrides }
}

const SEEDS = { clientSeed: 'crash-client', nonce: 1, serverSeed: 'crash-server' } as const
// With these seeds the crash point is 1.58× (locked in fair.test.ts).
const CRASH_POINT = 1.58

function game(account: Account, stake: number, config?: CrashHouseConfig) {
  return createCrashGame(account, { stake, ...SEEDS, config })
}

describe('createCrashGame', () => {
  it('holds the stake in pending via core and commits the crash point', () => {
    const a = account()
    const g = game(a, 100)
    expect(a.pending).toBe(100)
    expect(a.balance).toBe(0)
    expect(availableToWager(a)).toBe(900)
    expect(g.status).toBe('active')
    expect(g.crashPoint).toBe(CRASH_POINT)
    expect(g.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a stake larger than availableToWager (delegated to core)', () => {
    const a = account()
    expect(() => game(a, 1001)).toThrow(/exceeds availableToWager/)
    expect(a.pending).toBe(0)
  })

  it('locks the house config at bet time, defaulting to base 1% / no spread', () => {
    expect(game(account(), 100).config).toEqual({ baseEdge: 0.01, spread: 0 })
  })
})

describe('cashOut', () => {
  it('wins at the cashed multiplier and releases the hold', () => {
    const a = account()
    const g = game(a, 200)
    const paid = cashOut(a, g, 1.5) // below the 1.58 crash point
    expect(paid).toBe(1.5)
    expect(g.status).toBe('cashed')
    expect(g.cashOutMultiplier).toBe(1.5)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(200 * (1.5 - 1))) // +100
  })

  it('refuses to cash out at or past the crash point', () => {
    const a = account()
    const g = game(a, 100)
    expect(() => cashOut(a, g, CRASH_POINT)).toThrow(/too late/)
    expect(() => cashOut(a, g, 2.0)).toThrow(/too late/)
    expect(g.status).toBe('active') // still live; nothing resolved
    expect(a.pending).toBe(100)
  })

  it('refuses a cash-out at or below 1.00×', () => {
    const a = account()
    const g = game(a, 100)
    expect(() => cashOut(a, g, 1)).toThrow(/above 1/)
  })

  it('refuses to cash out an already-finished round', () => {
    const a = account()
    const g = game(a, 100)
    cashOut(a, g, 1.2)
    expect(() => cashOut(a, g, 1.3)).toThrow(/round is cashed/)
  })
})

describe('crashRound', () => {
  it('resolves a loss and releases the hold', () => {
    const a = account()
    const g = game(a, 150)
    crashRound(a, g)
    expect(g.status).toBe('busted')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-150)
  })

  it('cannot crash a round that already cashed', () => {
    const a = account()
    const g = game(a, 100)
    cashOut(a, g, 1.2)
    expect(() => crashRound(a, g)).toThrow(/round is cashed/)
  })
})

describe('instant-bust rounds (the house edge in action)', () => {
  it('a 1.00× crash point can never be cashed and always loses', () => {
    // serverSeed chosen so the crash point is exactly 1.00×.
    const a = account()
    // find a nonce that yields an instant bust under the default config
    let nonce = 0
    while (crashPointFromSeeds('crash-server', 'crash-client', nonce) !== 1 && nonce < 100000) nonce++
    const g = createCrashGame(a, {
      stake: 100,
      clientSeed: 'crash-client',
      nonce,
      serverSeed: 'crash-server',
    })
    expect(g.crashPoint).toBe(1)
    expect(() => cashOut(a, g, 1.01)).toThrow(/too late/)
    crashRound(a, g)
    expect(a.balance).toBe(-100)
  })
})

describe('provably-fair proof', () => {
  it('is withheld while active and verifiable once the round ends', () => {
    const a = account()
    const g = game(a, 100)
    expect(() => revealProof(g)).toThrow(/after the round ends/)

    cashOut(a, g, 1.4)
    const proof = revealProof(g)
    expect(proof.crashPoint).toBe(CRASH_POINT)
    expect(verifyCrashPoint(proof.serverSeed, proof.clientSeed, proof.nonce, proof.crashPoint)).toBe(
      true,
    )
  })
})
