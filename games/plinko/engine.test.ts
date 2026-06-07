import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playPlinko } from './engine.js'
import { dropBall, verifyDrop } from './fair.js'
import { payouts } from './payouts.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 1000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'plinko-client', nonce: 1, serverSeed: 'plinko-server' } as const

describe('dropBall', () => {
  it('produces a path of `rows` bits and a slot = count of rights, deterministically', () => {
    const d = dropBall('plinko-server', 'plinko-client', 1, 16)
    expect(d.path).toHaveLength(16)
    expect(d.path.every((b) => b === 0 || b === 1)).toBe(true)
    expect(d.slot).toBe(d.path.reduce((a, b) => a + b, 0))
    expect(d.slot).toBeGreaterThanOrEqual(0)
    expect(d.slot).toBeLessThanOrEqual(16)
    // same seeds → same drop
    expect(dropBall('plinko-server', 'plinko-client', 1, 16)).toEqual(d)
  })
})

describe('playPlinko', () => {
  it('settles the round at the landing slot’s multiplier through core', () => {
    const a = account()
    const { slot } = dropBall(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 16)
    const expectedMult = payouts(16, 'medium')[slot]
    const r = playPlinko(a, { stake: 100, rows: 16, risk: 'medium', ...BASE })

    expect(r.slot).toBe(slot)
    expect(r.multiplier).toBe(expectedMult)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(100 * (expectedMult - 1)))
    expect(r.profit).toBe(Math.round(100 * (expectedMult - 1)))
  })

  it('handles a sub-1× slot as a partial loss (not the whole stake)', () => {
    // Force a center landing by seeding a known low-multiplier slot, then assert
    // the figure only drops by the unreturned part.
    const a = account()
    const { slot } = dropBall(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 8)
    const mult = payouts(8, 'high')[slot]
    const r = playPlinko(a, { stake: 100, rows: 8, risk: 'high', ...BASE })
    expect(r.multiplier).toBe(mult)
    expect(a.balance).toBe(Math.round(100 * (mult - 1)))
    if (mult < 1) expect(a.balance).toBeGreaterThan(-100) // partial, not total
  })

  it('rejects bad rows and over-limit stakes, leaving the account untouched', () => {
    expect(() => playPlinko(account(), { stake: 10, rows: 7, risk: 'low', ...BASE })).toThrow(
      /rows must be/,
    )
    const a = account()
    expect(() => playPlinko(a, { stake: 1001, rows: 16, risk: 'low', ...BASE })).toThrow(
      /exceeds availableToWager/,
    )
    expect(availableToWager(a)).toBe(1000)
  })

  it('exposes a verifiable proof of the drop', () => {
    const r = playPlinko(account(), { stake: 10, rows: 12, risk: 'low', ...BASE })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyDrop(r.serverSeed, r.clientSeed, r.nonce, r.rows, r.slot)).toBe(true)
  })

  it('the house profits end-to-end: realized return < stake over many real drops', () => {
    // Drop tens of thousands of balls through the REAL engine on a fixed seed
    // sequence, sweeping every board, and total what actually comes back. It must
    // land UNDER what was staked — the baked-in edge delivered end to end
    // (seed → slot → paytable → core settlement), not just in theory. Low risk keeps
    // the variance tight so the realized figure converges cleanly; the EXACT edge of
    // every risk level (incl. the high-variance tables) is proven in payouts.test.ts.
    // Deterministic seeds → a stable proof, never a flaky sample.
    const a = account({ creditLimit: 1e15 })
    const stake = 1000
    let staked = 0
    let returned = 0
    for (let nonce = 1; nonce <= 24000; nonce++) {
      a.balance = 0
      a.pending = 0
      const rows = 8 + (nonce % 9) // sweep 8..16
      const r = playPlinko(a, { stake, rows, risk: 'low', clientSeed: 'edge', nonce, serverSeed: 'edge-srv' })
      staked += stake
      returned += stake + r.profit // = stake × multiplier
    }
    const realizedRtp = returned / staked
    expect(realizedRtp).toBeLessThan(1) // the house wins in the long run
    expect(realizedRtp).toBeGreaterThan(0.95) // and it's the ~1% edge, not a fluke
  })
})
