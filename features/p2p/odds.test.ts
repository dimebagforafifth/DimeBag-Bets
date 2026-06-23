import { describe, expect, it } from 'vitest'
import {
  EVEN_ODDS,
  accepterDecimalOdds,
  accepterStakeFor,
  potCents,
  winnerMultiplier,
  winnerStakeCents,
} from './odds.js'
import type { Challenge } from './types.js'

const challenge = (proposerStakeCents: number, accepterStakeCents: number): Challenge => ({
  id: 'c',
  proposer: { playerId: 'a', playerName: 'A' },
  title: 't',
  proposerPick: 'p',
  accepterPick: 'q',
  proposerStakeCents,
  accepterStakeCents,
  decimalOdds: 2,
  audience: 'open',
  status: 'open',
  createdAt: 0,
  expiresAt: 1,
})

describe('p2p odds — the no-vig stake math', () => {
  it('even money means equal stakes', () => {
    expect(accepterStakeFor(5_000, EVEN_ODDS)).toBe(5_000)
  })

  it('custom odds derive the accepter stake from the proposer profit they must cover', () => {
    // proposer risks 5000 at 1.8 → potential profit 4000 → accepter covers 4000
    expect(accepterStakeFor(5_000, 1.8)).toBe(4_000)
    // 4000 at 1.5 → profit 2000
    expect(accepterStakeFor(4_000, 1.5)).toBe(2_000)
  })

  it('rounds the derived stake to whole cents and never below 1', () => {
    expect(accepterStakeFor(333, 1.333)).toBe(Math.round(333 * 0.333))
    expect(accepterStakeFor(1, 1.0001)).toBe(1) // tiny edge still floors at 1 credit
  })

  it('rejects a non-positive proposer stake or odds ≤ 1', () => {
    expect(() => accepterStakeFor(0, 2)).toThrow()
    expect(() => accepterStakeFor(-5, 2)).toThrow()
    expect(() => accepterStakeFor(100, 1)).toThrow()
    expect(() => accepterStakeFor(100, 0.5)).toThrow()
  })

  it('the pot is both stakes; the winner multiplier always exceeds 1', () => {
    const c = challenge(5_000, 4_000)
    expect(potCents(c)).toBe(9_000)
    expect(winnerMultiplier(5_000, 9_000)).toBeCloseTo(1.8)
    expect(winnerMultiplier(4_000, 9_000)).toBeCloseTo(2.25)
    expect(winnerMultiplier(5_000, 9_000)).toBeGreaterThan(1)
    expect(winnerMultiplier(4_000, 9_000)).toBeGreaterThan(1)
  })

  it('the accepter sees the mirror price (pot / their stake)', () => {
    const c = challenge(5_000, 4_000)
    expect(accepterDecimalOdds(c)).toBeCloseTo(9_000 / 4_000)
  })

  it('reports the winning side’s stake', () => {
    const c = challenge(5_000, 4_000)
    expect(winnerStakeCents(c, 'proposer')).toBe(5_000)
    expect(winnerStakeCents(c, 'accepter')).toBe(4_000)
  })
})
