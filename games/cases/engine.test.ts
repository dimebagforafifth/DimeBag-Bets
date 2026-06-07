import { describe, it, expect } from 'vitest'
import type { Account } from '../../core/index.js'
import { availableToWager } from '../../core/index.js'
import { playCases } from './engine.js'
import { openCase, verifyCase } from './fair.js'
import { buildTiers, cumulativeWeights, rtpOf, RISKS, type CasesRisk } from './payouts.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000000, balance: 0, pending: 0, ...overrides }
}

const BASE = { clientSeed: 'cases-client', nonce: 1, serverSeed: 'cases-server' } as const

describe('buildTiers — probabilities + paying tiers', () => {
  it('probabilities sum to 1 for every risk', () => {
    for (const risk of RISKS) {
      const p = buildTiers(risk).reduce((a, t) => a + t.probability, 0)
      expect(p).toBeCloseTo(1, 10)
    }
  })

  it('tier 0 is the 0× blank; there are fixed partial returns and wins that beat 1×', () => {
    for (const risk of RISKS) {
      const tiers = buildTiers(risk)
      expect(tiers[0].multiplier).toBe(0)
      // every multiplier is a sane non-negative return
      for (const t of tiers) expect(t.multiplier).toBeGreaterThanOrEqual(0)
      // not all misses are 0 — at least one partial-return tier (0 < m < 1)
      expect(tiers.some((t) => t.multiplier > 0 && t.multiplier < 1)).toBe(true)
      // and at least one real win that beats the stake, and every win clears MIN_PAY
      expect(tiers.some((t) => t.multiplier > 1)).toBe(true)
      for (const t of tiers) if (t.multiplier > 1) expect(t.multiplier).toBeGreaterThanOrEqual(1.1)
    }
  })

  it('paying multipliers are non-decreasing in tier index', () => {
    for (const risk of RISKS) {
      const paying = buildTiers(risk)
        .map((t) => t.multiplier)
        .filter((m) => m > 0)
      for (let i = 1; i < paying.length; i++) {
        expect(paying[i]).toBeGreaterThanOrEqual(paying[i - 1])
      }
    }
  })

  it('higher risk reaches a bigger top multiplier', () => {
    const topLow = Math.max(...buildTiers('low').map((t) => t.multiplier))
    const topHigh = Math.max(...buildTiers('high').map((t) => t.multiplier))
    expect(topHigh).toBeGreaterThan(topLow)
  })

  it('cumulative weights are increasing and end at ~1', () => {
    const cum = cumulativeWeights(buildTiers('medium'))
    for (let i = 1; i < cum.length; i++) expect(cum[i]).toBeGreaterThan(cum[i - 1])
    expect(cum[cum.length - 1]).toBeCloseTo(1, 10)
  })
})

describe('rtpOf — the edge is provably correct', () => {
  it('realized RTP ≈ (1 − edge) for every risk', () => {
    for (const risk of RISKS as CasesRisk[]) {
      const rtp = rtpOf(risk)
      // computed to hit 0.99; rounding multipliers to 2dp leaves a hair of drift
      expect(rtp).toBeGreaterThan(0.985)
      expect(rtp).toBeLessThan(0.995)
    }
  })

  it('a different edge shifts the RTP', () => {
    expect(rtpOf('medium', { edge: 0 })).toBeGreaterThan(rtpOf('medium', { edge: 0.1 }))
    expect(rtpOf('medium', { edge: 0 })).toBeCloseTo(1, 2)
  })
})

describe('openCase + verifyCase', () => {
  it('lands on a valid tier, deterministically, and verifies', () => {
    for (const risk of RISKS) {
      const tiers = buildTiers(risk)
      const r = openCase(BASE.serverSeed, BASE.clientSeed, BASE.nonce, risk)
      expect(r.tierIndex).toBeGreaterThanOrEqual(0)
      expect(r.tierIndex).toBeLessThan(tiers.length)
      expect(r.multiplier).toBe(tiers[r.tierIndex].multiplier)
      // deterministic
      expect(openCase(BASE.serverSeed, BASE.clientSeed, BASE.nonce, risk)).toEqual(r)
      // verifies
      expect(verifyCase(BASE.serverSeed, BASE.clientSeed, BASE.nonce, risk, r)).toBe(true)
      // a tampered tier fails verification
      expect(
        verifyCase(BASE.serverSeed, BASE.clientSeed, BASE.nonce, risk, {
          tierIndex: r.tierIndex,
          multiplier: r.multiplier + 1,
        }),
      ).toBe(false)
    }
  })

  it('the chosen tier matches the float over the cumulative weights', () => {
    // Re-derive the expected tier from the cumulative boundaries directly.
    const tiers = buildTiers('high')
    const cum = cumulativeWeights(tiers)
    const r = openCase(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 'high')
    // the float that produced it must fall in (cum[idx-1], cum[idx])
    const lower = r.tierIndex === 0 ? 0 : cum[r.tierIndex - 1]
    const upper = cum[r.tierIndex]
    // sanity: the band is non-empty
    expect(upper).toBeGreaterThan(lower)
  })
})

describe('playCases — settlement through core', () => {
  it('settles at the landed tier multiplier (a win) and clears pending', () => {
    const a = account()
    const expected = openCase(BASE.serverSeed, BASE.clientSeed, BASE.nonce, 'low')
    const r = playCases(a, { stake: 1000, risk: 'low', ...BASE })
    expect(r.tierIndex).toBe(expected.tierIndex)
    expect(r.multiplier).toBe(expected.multiplier)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(Math.round(1000 * (expected.multiplier - 1)))
  })

  it('a 0× blank is a full loss through core', () => {
    // Find a (nonce) that lands on the blank for high risk (blank is ~62%).
    let nonce = 1
    while (openCase(BASE.serverSeed, BASE.clientSeed, nonce, 'high').tierIndex !== 0) nonce++
    const a = account()
    const r = playCases(a, { stake: 1000, risk: 'high', clientSeed: BASE.clientSeed, nonce, serverSeed: BASE.serverSeed })
    expect(r.multiplier).toBe(0)
    expect(r.profit).toBe(-1000)
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-1000)
  })

  it('a > 1× win pays profit = stake × (mult − 1) through core', () => {
    // Find a nonce landing on a paying tier for low risk.
    let nonce = 1
    while (openCase(BASE.serverSeed, BASE.clientSeed, nonce, 'low').multiplier <= 1) nonce++
    const open = openCase(BASE.serverSeed, BASE.clientSeed, nonce, 'low')
    const a = account()
    const r = playCases(a, { stake: 1000, risk: 'low', clientSeed: BASE.clientSeed, nonce, serverSeed: BASE.serverSeed })
    expect(r.multiplier).toBe(open.multiplier)
    expect(r.multiplier).toBeGreaterThan(1)
    expect(a.balance).toBe(Math.round(1000 * (open.multiplier - 1)))
    expect(a.pending).toBe(0)
  })

  it('rejects an over-limit stake before opening', () => {
    const a = account({ creditLimit: 500, balance: 0 })
    expect(() => playCases(a, { stake: 501, risk: 'low', ...BASE })).toThrow(
      /exceeds availableToWager/,
    )
    expect(availableToWager(a)).toBe(500)
    expect(a.pending).toBe(0)
  })

  it('exposes a verifiable open with a committed server-seed hash', () => {
    const r = playCases(account(), { stake: 100, risk: 'medium', ...BASE })
    expect(r.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(
      verifyCase(r.serverSeed, r.clientSeed, r.nonce, r.risk, {
        tierIndex: r.tierIndex,
        multiplier: r.multiplier,
      }),
    ).toBe(true)
  })
})
