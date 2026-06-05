import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playLimbo } from './engine.js'
import { limboFromSeeds } from './fair.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 1000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'limbo-client', nonce: 1, serverSeed: 'limbo-server' } as const
const RESULT = limboFromSeeds('limbo-server', 'limbo-client', 1)

describe('playLimbo', () => {
  it('wins (paid at target) when result ≥ target', () => {
    const a = account()
    const target = Math.max(1.01, RESULT - 0.5) // ensure result clears it
    const r = playLimbo(a, { stake: 100, target, ...BASE })
    expect(r.result).toBe(RESULT)
    expect(r.won).toBe(true)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(100 * (target - 1)))
  })

  it('loses when result < target', () => {
    const a = account()
    const target = RESULT + 1 // unreachable
    const r = playLimbo(a, { stake: 100, target, ...BASE })
    expect(r.won).toBe(false)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-100)
  })

  it('rejects an out-of-range target and over-limit stake', () => {
    expect(() => playLimbo(account(), { stake: 100, target: 1, ...BASE })).toThrow(/target/)
    const a = account()
    expect(() => playLimbo(a, { stake: 1001, target: 2, ...BASE })).toThrow(
      /exceeds availableToWager/,
    )
    expect(a.pending).toBe(0)
    expect(availableToWager(a)).toBe(1000)
  })

  it('exposes a verifiable proof', () => {
    const r = playLimbo(account(), { stake: 10, target: 2, ...BASE })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(limboFromSeeds(r.serverSeed, r.clientSeed, r.nonce)).toBe(r.result)
  })
})
