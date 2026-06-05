import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playKeno } from './engine.js'
import { drawNumbers, verifyDraw } from './fair.js'
import { buildPaytable } from './paytable.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 1000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'keno-client', nonce: 1, serverSeed: 'keno-server' } as const
const DRAWN = drawNumbers('keno-server', 'keno-client', 1)

describe('drawNumbers', () => {
  it('draws 10 distinct numbers in 1..40, deterministically', () => {
    expect(DRAWN).toHaveLength(10)
    expect(new Set(DRAWN).size).toBe(10)
    expect(Math.min(...DRAWN)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...DRAWN)).toBeLessThanOrEqual(40)
    expect(drawNumbers('keno-server', 'keno-client', 1)).toEqual(DRAWN)
  })
})

describe('playKeno', () => {
  it('counts hits and settles a win through core at the table multiplier', () => {
    const a = account()
    // pick the 5 drawn numbers → 5/5 hits
    const picks = DRAWN.slice(0, 5)
    const r = playKeno(a, { stake: 100, picks, risk: 'classic', ...BASE })
    expect(r.hits).toBe(5)
    const mult = buildPaytable(5, 'classic')[5]
    expect(r.multiplier).toBe(mult)
    expect(r.won).toBe(true)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(100 * (mult - 1)))
  })

  it('settles a loss when too few numbers hit', () => {
    const a = account()
    // pick 5 numbers NOT drawn → 0 hits
    const notDrawn = Array.from({ length: 40 }, (_, i) => i + 1).filter((n) => !DRAWN.includes(n))
    const r = playKeno(a, { stake: 100, picks: notDrawn.slice(0, 5), risk: 'classic', ...BASE })
    expect(r.hits).toBe(0)
    expect(r.won).toBe(false)
    expect(a.balance).toBe(-100)
  })

  it('rejects bad picks and over-limit stakes', () => {
    expect(() => playKeno(account(), { stake: 10, picks: [], risk: 'low', ...BASE })).toThrow(/pick/)
    expect(() => playKeno(account(), { stake: 10, picks: [1, 1], risk: 'low', ...BASE })).toThrow(
      /unique/,
    )
    expect(() => playKeno(account(), { stake: 10, picks: [41], risk: 'low', ...BASE })).toThrow(/1\.\.40/)
    const a = account()
    expect(() => playKeno(a, { stake: 1001, picks: [1], risk: 'low', ...BASE })).toThrow(
      /exceeds availableToWager/,
    )
    expect(availableToWager(a)).toBe(1000)
  })

  it('exposes a verifiable proof', () => {
    const r = playKeno(account(), { stake: 10, picks: [1, 2, 3], risk: 'low', ...BASE })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyDraw(r.serverSeed, r.clientSeed, r.nonce, r.drawn)).toBe(true)
  })
})
