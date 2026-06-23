/** Referral engine — the PURE anti-abuse + qualification predicates. No money, no stores. */
import { describe, expect, it } from 'vitest'
import { claimGuard, generateCode, qualifies, rewardOf } from './engine.js'
import { DEFAULT_REFERRAL_CONFIG, type Referral } from './types.js'

const referral = (over: Partial<Referral> = {}): Referral => ({
  code: 'INV-0001',
  referrerId: 'r1',
  refereeId: null,
  status: 'pending',
  rewardCents: 5000,
  createdAt: 0,
  claimedAt: null,
  qualifiedAt: null,
  ...over,
})

describe('generateCode', () => {
  it('is deterministic, prefixed, and distinct per sequence', () => {
    expect(generateCode(0)).toBe('INV-0001')
    expect(generateCode(0)).toBe(generateCode(0))
    expect(generateCode(1)).not.toBe(generateCode(0))
  })
})

describe('claimGuard', () => {
  it('accepts a distinct referee on an open, unclaimed invite', () => {
    expect(claimGuard(referral(), 'p2')).toEqual({ ok: true })
  })
  it('blocks self-referral', () => {
    expect(claimGuard(referral({ referrerId: 'r1' }), 'r1').ok).toBe(false)
  })
  it('blocks an already-claimed or non-pending invite', () => {
    expect(claimGuard(referral({ refereeId: 'pX' }), 'p2').ok).toBe(false)
    expect(claimGuard(referral({ status: 'rewarded' }), 'p2').ok).toBe(false)
  })
})

describe('qualifies — signup alone never pays', () => {
  const on = { ...DEFAULT_REFERRAL_CONFIG, enabled: true, rewardCents: 5000, minSettledWagers: 1 }
  it('requires real settled activity (≥ the rule), and only when enabled', () => {
    expect(qualifies(0, on)).toBe(false) // signup only — blocked
    expect(qualifies(1, on)).toBe(true)
    expect(qualifies(5, { ...on, minSettledWagers: 3 })).toBe(true)
    expect(qualifies(2, { ...on, minSettledWagers: 3 })).toBe(false)
    expect(qualifies(99, { ...on, enabled: false })).toBe(false) // no program → never
  })
})

describe('rewardOf', () => {
  it('reads the per-party snapshot, clamping a missing reward to 0', () => {
    expect(rewardOf(referral({ rewardCents: 2500 }))).toBe(2500)
    expect(rewardOf(referral({ rewardCents: 0 }))).toBe(0)
  })
})
