/**
 * The demo seed populates every lifecycle state with REAL core moves, and — because every
 * challenge is zero-sum — the seeded players' figures sum to exactly zero (no house leakage in
 * the demo either).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { accountBook, challenges } from './store.js'
import { SEED_PLAYERS, __resetChallenges, seedChallenges } from './seed.js'

const NOW = 5_000_000

beforeEach(() => {
  __resetChallenges()
  seedChallenges(NOW)
})

describe('seedChallenges', () => {
  it('renders every lifecycle state', () => {
    const statuses = new Set(challenges.all().map((c) => c.status))
    expect(statuses.has('open')).toBe(true)
    expect(statuses.has('accepted')).toBe(true)
    expect(statuses.has('settled')).toBe(true)
    expect(statuses.has('voided')).toBe(true)
  })

  it('seeds a settled win for each side (an even-money one and a custom-odds upset)', () => {
    const settled = challenges.all().filter((c) => c.status === 'settled')
    expect(settled.some((c) => c.winner === 'proposer')).toBe(true)
    expect(settled.some((c) => c.winner === 'accepter')).toBe(true)
  })

  it('the in-flight match really escrowed both stakes via core', () => {
    const accepted = challenges.all().find((c) => c.status === 'accepted')!
    const proposer = accountBook.get(accepted.proposer.playerId)!
    const accepter = accountBook.get(accepted.accepter!.playerId)!
    expect(proposer.pending).toBeGreaterThanOrEqual(accepted.proposerStakeCents)
    expect(accepter.pending).toBeGreaterThanOrEqual(accepted.accepterStakeCents)
  })

  it('zero house leakage across the whole demo: seeded figures sum to zero', () => {
    const total = SEED_PLAYERS.reduce(
      (sum, p) => sum + (accountBook.get(p.playerId)?.balance ?? 0),
      0,
    )
    expect(total).toBe(0)
  })
})
