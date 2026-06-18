/**
 * The leaderboard projection ranks entrants by their metric (desc) and assigns each rank its
 * prize from the pool. Proves the prize math (pool = guarantee + fees, split by rank), the
 * ranking + tiebreak, and the payout extraction. Deterministic via a demo (seeded) board.
 */
import { describe, it, expect } from 'vitest'
import { prizePool, prizeForRank, allocatePrizes, standingsFor, payoutsFor } from './leaderboard.js'
import type { Competition } from './types.js'

function demoComp(over: Partial<Competition> = {}): Competition {
  return {
    id: 'c1',
    name: 'Race',
    theme: 'weekly_race',
    metric: 'wagered',
    startsAt: 0,
    endsAt: 100,
    entryFeeCents: 1_000,
    guaranteedCents: 50_000,
    payoutSplit: [0.5, 0.3, 0.2],
    eligibility: { kind: 'all' },
    settlement: 'open',
    createdBy: 'operator',
    demo: true,
    seededStandings: [
      { accountId: 'a', name: 'Ana', value: 300 },
      { accountId: 'b', name: 'Bo', value: 900 },
      { accountId: 'c', name: 'Cy', value: 600 },
    ],
    ...over,
  }
}

describe('prizePool + prizeForRank', () => {
  it('pool = guarantee + entry fees, split by rank, ranks past the split win nothing', () => {
    expect(prizePool({ guaranteedCents: 50_000, entryFeeCents: 1_000 } as Competition, 4)).toBe(
      54_000,
    )
    expect(prizeForRank(1, 100_000, [0.5, 0.3, 0.2])).toBe(50_000)
    expect(prizeForRank(3, 100_000, [0.5, 0.3, 0.2])).toBe(20_000)
    expect(prizeForRank(4, 100_000, [0.5, 0.3, 0.2])).toBe(0)
  })
})

describe('allocatePrizes — conservation (never overpays the pool)', () => {
  it('distributes the rounding remainder without exceeding the pool', () => {
    // naive per-rank rounding would pay 51 + 51 = 102 on a 101 pool; the allocator caps at 101
    expect(allocatePrizes(101, [0.5, 0.5])).toEqual([51, 50])
    expect(allocatePrizes(999, [0.4, 0.3, 0.2, 0.1]).reduce((a, b) => a + b, 0)).toBe(999)
    // a split summing to < 1 leaves the rake undistributed (80% of 1,000 paid)
    expect(allocatePrizes(1_000, [0.5, 0.3]).reduce((a, b) => a + b, 0)).toBe(800)
    // never exceeds the pool across odd splits
    for (const pool of [1, 7, 101, 333, 99_999]) {
      const sum = allocatePrizes(pool, [0.5, 0.3, 0.2]).reduce((a, b) => a + b, 0)
      expect(sum).toBeLessThanOrEqual(pool)
    }
  })
})

describe('standingsFor', () => {
  it('ranks a demo board desc by value and stamps each rank its prize', () => {
    const comp = demoComp({ prizePoolCents: 100_000 })
    const board = standingsFor(comp, [], 50)
    expect(board.map((s) => s.name)).toEqual(['Bo', 'Cy', 'Ana']) // 900 > 600 > 300
    expect(board.map((s) => s.rank)).toEqual([1, 2, 3])
    expect(board[0].prizeCents).toBe(50_000) // 50% of 100,000
    expect(board[1].prizeCents).toBe(30_000)
    expect(board[2].prizeCents).toBe(20_000)
  })

  it('breaks ties by name for a stable order', () => {
    const comp = demoComp({
      seededStandings: [
        { accountId: 'z', name: 'Zoe', value: 500 },
        { accountId: 'a', name: 'Abe', value: 500 },
      ],
      prizePoolCents: 100_000,
      payoutSplit: [1],
    })
    const board = standingsFor(comp, [], 50)
    expect(board.map((s) => s.name)).toEqual(['Abe', 'Zoe'])
    expect(board[0].prizeCents).toBe(100_000)
  })
})

describe('payoutsFor', () => {
  it('keeps only in-the-money rows as the audited payout list', () => {
    const comp = demoComp({ prizePoolCents: 100_000, payoutSplit: [0.7, 0.3] })
    const board = standingsFor(comp, [], 50) // 3 entrants, only top 2 paid
    const payouts = payoutsFor(board)
    expect(payouts.map((p) => p.rank)).toEqual([1, 2])
    expect(payouts.reduce((s, p) => s + p.prizeCents, 0)).toBe(100_000)
  })
})
