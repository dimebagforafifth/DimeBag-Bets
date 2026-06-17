/**
 * The bonus RULES model — pure logic: segment derivation, eligibility gating, reward sizing
 * with the max-win cap, and the playthrough requirement. No money, no stores.
 */
import { describe, it, expect } from 'vitest'
import {
  playerSegment,
  isEligible,
  rawRewardCents,
  rewardGrantCents,
  requiredTurnoverCents,
  SEGMENT_VIP_WAGERED,
  SEGMENT_NEW_WAGERED,
  type BonusRule,
  type EligibilityContext,
} from './rules.js'

const rule = (over: Partial<BonusRule> = {}): BonusRule => ({
  id: 'r',
  name: 'R',
  enabled: true,
  trigger: 'manual',
  reward: { kind: 'credit', valueCents: 100_00 },
  eligibility: {},
  playthroughX: 3,
  expiryMs: 7 * 86_400_000,
  maxWinCents: null,
  ...over,
})

const ctx = (over: Partial<EligibilityContext> = {}): EligibilityContext => ({
  playerId: 'p1',
  tierId: 'gold',
  segment: 'vip',
  agentChain: ['a-e', 'sa-n', 'mgr'],
  balanceCents: 10_000,
  active: true,
  ...over,
})

describe('playerSegment', () => {
  it('a player in the red is at-risk regardless of volume', () => {
    expect(playerSegment(SEGMENT_VIP_WAGERED + 1, -1)).toBe('at-risk')
  })
  it('high lifetime volume is VIP', () => {
    expect(playerSegment(SEGMENT_VIP_WAGERED, 500)).toBe('vip')
  })
  it('low volume is new; mid volume in the black is winning, flat is casual', () => {
    expect(playerSegment(SEGMENT_NEW_WAGERED - 1, 0)).toBe('new')
    expect(playerSegment(SEGMENT_NEW_WAGERED + 1, 10)).toBe('winning')
    expect(playerSegment(SEGMENT_NEW_WAGERED + 1, 0)).toBe('casual')
  })
})

describe('isEligible', () => {
  it('an empty filter matches any active player', () => {
    expect(isEligible(rule(), ctx())).toBe(true)
  })
  it('a disabled rule never qualifies', () => {
    expect(isEligible(rule({ enabled: false }), ctx())).toBe(false)
  })
  it('a suspended player never qualifies', () => {
    expect(isEligible(rule(), ctx({ active: false }))).toBe(false)
  })
  it('gates by tier', () => {
    expect(isEligible(rule({ eligibility: { tiers: ['platinum', 'diamond'] } }), ctx({ tierId: 'gold' }))).toBe(false)
    expect(isEligible(rule({ eligibility: { tiers: ['gold'] } }), ctx({ tierId: 'gold' }))).toBe(true)
  })
  it('gates by segment', () => {
    expect(isEligible(rule({ eligibility: { segments: ['new'] } }), ctx({ segment: 'vip' }))).toBe(false)
    expect(isEligible(rule({ eligibility: { segments: ['vip', 'new'] } }), ctx({ segment: 'vip' }))).toBe(true)
  })
  it('gates by agent downline (the chain must include the agent)', () => {
    expect(isEligible(rule({ eligibility: { agentId: 'sa-n' } }), ctx())).toBe(true)
    expect(isEligible(rule({ eligibility: { agentId: 'a-w' } }), ctx())).toBe(false)
  })
  it('gates by figure floor/ceiling', () => {
    expect(isEligible(rule({ eligibility: { maxBalanceCents: 0 } }), ctx({ balanceCents: 10_000 }))).toBe(false)
    expect(isEligible(rule({ eligibility: { minBalanceCents: 5_000 } }), ctx({ balanceCents: 10_000 }))).toBe(true)
  })
})

describe('reward sizing + max-win cap', () => {
  it('credit is a flat amount', () => {
    expect(rawRewardCents({ kind: 'credit', valueCents: 250_00 })).toBe(250_00)
  })
  it('match is a percent of the deposit amount', () => {
    expect(rawRewardCents({ kind: 'match', pct: 50 }, { amountCents: 10_000_00 })).toBe(5_000_00)
  })
  it('rakeback is a percent of losses', () => {
    expect(rawRewardCents({ kind: 'rakeback', pct: 10 }, { lossesCents: 3_000_00 })).toBe(300_00)
  })
  it('free-spins is not a credit grant', () => {
    expect(rawRewardCents({ kind: 'free-spins', spins: 5 })).toBe(0)
  })
  it('the max-win cap bounds the granted credit (the "up to $X")', () => {
    const r = rule({ reward: { kind: 'match', pct: 100 }, maxWinCents: 5_000_00 })
    expect(rewardGrantCents(r, { amountCents: 12_000_00 })).toBe(5_000_00) // 12k → capped at 5k
    expect(rewardGrantCents(r, { amountCents: 3_000_00 })).toBe(3_000_00) // under the cap → full
  })
})

describe('requiredTurnoverCents', () => {
  it('is the grant times the playthrough multiple', () => {
    expect(requiredTurnoverCents(rule({ playthroughX: 5 }), 1_000_00)).toBe(5_000_00)
  })
  it('a zero multiple clears instantly', () => {
    expect(requiredTurnoverCents(rule({ playthroughX: 0 }), 1_000_00)).toBe(0)
  })
})
