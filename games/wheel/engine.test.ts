import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playWheel } from './engine.js'
import { spinSegment, verifySpin } from './fair.js'
import { buildWheel } from './payouts.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'wheel-client', nonce: 1, serverSeed: 'wheel-server' } as const

describe('spinSegment', () => {
  it('lands in 0..segments−1, deterministically', () => {
    for (const segments of [10, 20, 50]) {
      const s = spinSegment('wheel-server', 'wheel-client', 1, segments)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(segments)
      expect(spinSegment('wheel-server', 'wheel-client', 1, segments)).toBe(s)
    }
  })
})

describe('playWheel', () => {
  it('settles at the landing segment’s multiplier through core', () => {
    const a = account()
    const segment = spinSegment(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 20)
    const mult = buildWheel('medium', 20)[segment]
    const r = playWheel(a, { stake: 1000, risk: 'medium', segments: 20, ...BASE })
    expect(r.segment).toBe(segment)
    expect(r.multiplier).toBe(mult)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(1000 * (mult - 1)))
  })

  it('rejects bad segment counts and over-limit stakes', () => {
    expect(() => playWheel(account(), { stake: 100, risk: 'low', segments: 15, ...BASE })).toThrow(
      /segments must be/,
    )
    const a = account({ creditLimit: 500 })
    expect(() => playWheel(a, { stake: 501, risk: 'low', segments: 10, ...BASE })).toThrow(
      /exceeds availableToWager/,
    )
    expect(availableToWager(a)).toBe(500)
  })

  it('exposes a verifiable spin', () => {
    const r = playWheel(account(), { stake: 100, risk: 'high', segments: 30, ...BASE })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifySpin(r.serverSeed, r.clientSeed, r.nonce, r.segments, r.segment)).toBe(true)
  })
})
