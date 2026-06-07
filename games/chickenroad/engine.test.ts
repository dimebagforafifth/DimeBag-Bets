import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { cashOut, createChickenGame, nextMultiplier, step } from './engine.js'
import { crashLane, verifyCrashLane } from './fair.js'
import { laneMultiplier, laneMultipliers, SPECS } from './payouts.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 1_000_000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'chick-client', nonce: 1, serverSeed: 'chick-server' } as const

describe('laneMultipliers', () => {
  it('is (1−edge)/survivalⁱ — strictly increasing, harder climbs faster', () => {
    for (const d of ['easy', 'medium', 'hard', 'daredevil'] as const) {
      const ladder = laneMultipliers(d)
      expect(ladder).toHaveLength(SPECS[d].lanes)
      for (let i = 1; i < ladder.length; i++) expect(ladder[i]).toBeGreaterThan(ladder[i - 1])
      expect(ladder[0]).toBeGreaterThan(1) // even the first lane pays over the stake
    }
    // daredevil (survival 0.55) climbs far faster than easy (0.90)
    expect(laneMultiplier(5, 'daredevil')).toBeGreaterThan(laneMultiplier(5, 'easy'))
    // exact value: easy lane 1 = 0.98 / 0.9 = 1.0889 → 1.09 (2% edge, matches InOut)
    expect(laneMultiplier(1, 'easy')).toBeCloseTo(1.09, 2)
  })

  it('keeps a provably-correct 2% edge (InOut Chicken Road): P(reach i)·mult(i) ≈ 0.98 at every lane', () => {
    const d = 'medium'
    const p = SPECS[d].survival
    for (let i = 1; i <= SPECS[d].lanes; i++) {
      expect(p ** i * laneMultiplier(i, d)).toBeCloseTo(0.98, 1)
    }
  })
})

describe('crashLane', () => {
  it('is the first failed lane, or lanes+1 when the road is crossed', () => {
    const { survival, lanes } = SPECS.medium
    const c = crashLane('chick-server', 'chick-client', 1, survival, lanes)
    expect(c).toBeGreaterThanOrEqual(1)
    expect(c).toBeLessThanOrEqual(lanes + 1)
    expect(crashLane('chick-server', 'chick-client', 1, survival, lanes)).toBe(c) // deterministic
  })
})

describe('createChickenGame + step + cashOut', () => {
  it('steps raise the multiplier up to the crash lane, then bust loses the stake', () => {
    const a = account()
    const g = createChickenGame(a, { stake: 1000, difficulty: 'medium', ...BASE })
    expect(a.pending).toBe(1000)
    const crash = g.crashLane

    // Walk safely up to (but not into) the crash lane.
    for (let i = 1; i < crash && i < g.lanes; i++) {
      const res = step(a, g)
      expect(res.hit).toBe(false)
      expect(g.multiplier).toBeCloseTo(laneMultiplier(i, 'medium'), 6)
    }

    if (crash <= g.lanes) {
      const res = step(a, g) // into the crash lane
      expect(res.hit).toBe(true)
      expect(g.status).toBe('busted')
      expect(a.pending).toBe(0)
      expect(a.balance).toBe(-1000)
    } else {
      expect(g.status).toBe('cleared') // crossed everything → auto-cash
    }
  })

  it('cash out settles at the reached lane and refuses before the first step', () => {
    const a = account()
    const g = createChickenGame(a, { stake: 1000, difficulty: 'easy', ...BASE })
    expect(() => cashOut(a, g)).toThrow(/at least one step/)
    expect(nextMultiplier(g)).toBeCloseTo(laneMultiplier(1, 'easy'), 6)

    const res = step(a, g)
    if (res.hit) return // unlucky fixture — first lane crashed; nothing to cash
    const m = g.multiplier
    cashOut(a, g)
    expect(g.status).toBe('cashed')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(1000 * (m - 1)))
  })

  it('exposes a verifiable crash lane', () => {
    const a = account()
    const g = createChickenGame(a, { stake: 1000, difficulty: 'hard', ...BASE })
    expect(g.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(
      verifyCrashLane(g.serverSeed, g.clientSeed, g.nonce, SPECS.hard.survival, g.lanes, g.crashLane),
    ).toBe(true)
  })
})
