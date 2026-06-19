import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playDice } from './engine.js'
import { effectiveTarget, multiplierFor, rollFromSeeds, winChance } from './fair.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 1000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'dice-client', nonce: 1, serverSeed: 'dice-server' } as const
const ROLL = rollFromSeeds('dice-server', 'dice-client', 1) // the round's roll

describe('playDice', () => {
  it('settles a win through core at the right multiplier', () => {
    const a = account()
    // target chosen so this roll wins on "over"
    const target = Math.max(0, ROLL - 10)
    const r = playDice(a, { stake: 100, target, direction: 'over', ...BASE })
    expect(r.won).toBe(true)
    expect(a.pending).toBe(0)
    expect(r.multiplier).toBeCloseTo(multiplierFor(winChance(target, 'over')), 6)
    expect(a.balance).toBe(Math.round(100 * (r.multiplier - 1)))
  })

  it('settles a loss through core', () => {
    const a = account()
    const target = Math.min(100, ROLL + 10) // roll is under target → "over" loses
    const r = playDice(a, { stake: 100, target, direction: 'over', ...BASE })
    expect(r.won).toBe(false)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-100)
  })

  it('returns the stake on an exact tie (push, not a loss)', () => {
    const a = account()
    // Place the target exactly on the roll so the round lands on the boundary.
    // (For these seeds the roll is mid-range, so the effective "over" target is
    // the roll itself — precondition asserted below.)
    expect(effectiveTarget(ROLL, 'over')).toBeCloseTo(ROLL, 10)
    const r = playDice(a, { stake: 100, target: ROLL, direction: 'over', ...BASE })
    expect(r.outcome).toBe('push')
    expect(r.won).toBe(false)
    expect(a.pending).toBe(0) // hold released
    expect(a.balance).toBe(0) // stake returned — neither won nor lost
  })

  it('holds and releases the stake via core (rejects over-limit)', () => {
    const a = account()
    expect(() => playDice(a, { stake: 1001, target: 50, direction: 'over', ...BASE })).toThrow(
      /exceeds availableToWager/,
    )
    expect(a.pending).toBe(0)
    expect(availableToWager(a)).toBe(1000)
  })

  it('refuses an unwinnable bet (multiplier ≤ 1) without holding any stake', () => {
    const a = account()
    // target 2 / over → 98% win chance (clamped). At a 5% house edge the payout
    // prices to 0.97× — a bet a "win" can't profit on. The engine must refuse it
    // BEFORE placing, or core would release a hold it never graded (corruption).
    expect(() =>
      playDice(a, { stake: 100, target: 2, direction: 'over', ...BASE, config: { edge: 0.05 } }),
    ).toThrow(/no profit/)
    expect(a.pending).toBe(0) // nothing held — no leaked hold
    expect(a.balance).toBe(0)
    expect(availableToWager(a)).toBe(1000)
  })

  it('accepts that same near-certain target at the default edge (price stays > 1×)', () => {
    const a = account()
    // 98% win chance at the default ~1% edge → 1.0102× (> 1), so it grades cleanly.
    const r = playDice(a, { stake: 100, target: 2, direction: 'over', ...BASE })
    expect(r.multiplier).toBeGreaterThan(1)
    expect(a.pending).toBe(0) // resolved, hold released
  })

  it('exposes a verifiable provably-fair proof', () => {
    const a = account()
    const r = playDice(a, { stake: 10, target: 50, direction: 'over', ...BASE })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(rollFromSeeds(r.serverSeed, r.clientSeed, r.nonce)).toBe(r.roll)
  })

  it('holds a ~1% edge over many rounds (simulated RTP)', () => {
    let staked = 0
    let returned = 0
    for (let n = 0; n < 6000; n++) {
      const a = account({ balance: 0 })
      playDice(a, {
        stake: 100,
        target: 50,
        direction: 'over',
        clientSeed: 'rtp',
        nonce: n,
        serverSeed: 'rtp-srv',
      })
      staked += 100
      returned += 100 + a.balance // stake back + net change
    }
    const rtp = returned / staked
    expect(rtp).toBeGreaterThan(0.95)
    expect(rtp).toBeLessThan(1.03)
  })
})
