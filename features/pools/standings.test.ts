/**
 * Standings are a PURE read-only projection — the cardinal rule. Deriving them reconciles to the
 * entries/results, is deterministic, and moves NO credit (no core money event fires).
 */

import { describe, expect, it } from 'vitest'
import { onGrant, onWagerPlaced, onWagerResolved } from '../../core/index.js'
import { poolStandings, poolWinners } from './standings.js'
import type { PoolResults } from './formats/types.js'
import type { Pool, PoolEntry } from './types.js'

const NOW = 1_750_000_000_000

const pool: Pool = {
  id: 'pool-x',
  tenantId: 'default',
  creatorId: 'mgr',
  creatorName: 'House',
  name: 'Proj',
  kind: 'pickem',
  scope: 'event',
  privacy: 'public',
  entryCents: 1_000,
  maxEntries: null,
  minEntries: 1,
  guaranteedCents: 0,
  prizeStructure: [0.7, 0.3],
  rakeBps: 0,
  config: {
    kind: 'pickem',
    games: [
      { id: 'g1', label: 'G1', options: ['Home', 'Away'] },
      { id: 'g2', label: 'G2', options: ['Home', 'Away'] },
    ],
  },
  results: { kind: 'pickem', winners: { g1: 'Home', g2: 'Away' } },
  lifecycle: 'scoring',
  lockAt: NOW,
  createdAt: NOW,
}
const entries: PoolEntry[] = [
  {
    id: 'e1',
    poolId: 'pool-x',
    accountId: 'a',
    playerName: 'A',
    joinedAt: NOW,
    stakeCents: 1_000,
    picks: { kind: 'pickem', selections: { g1: 'Home', g2: 'Away' } },
  },
  {
    id: 'e2',
    poolId: 'pool-x',
    accountId: 'b',
    playerName: 'B',
    joinedAt: NOW,
    stakeCents: 1_000,
    picks: { kind: 'pickem', selections: { g1: 'Home', g2: 'Home' } },
  },
]

describe('pool standings projection', () => {
  it('ranks deterministically from entries + results', () => {
    const s = poolStandings(pool, entries)
    expect(s.map((r) => [r.accountId, r.points, r.rank])).toEqual([
      ['a', 2, 1],
      ['b', 1, 2],
    ])
    // deterministic
    expect(poolStandings(pool, entries)).toEqual(s)
  })

  it('renders before any result is posted (empty board)', () => {
    const fresh: Pool = { ...pool, results: undefined }
    const s = poolStandings(fresh, entries)
    expect(s).toHaveLength(2)
    expect(s.every((r) => r.points === 0)).toBe(true)
  })

  it('moves NO money — no core place/resolve/grant event fires while projecting', () => {
    let events = 0
    const offs = [
      onWagerPlaced(() => (events += 1)),
      onWagerResolved(() => (events += 1)),
      onGrant(() => (events += 1)),
    ]
    const results: PoolResults = { kind: 'pickem', winners: { g1: 'Home', g2: 'Away' } }
    for (let i = 0; i < 10; i += 1) {
      poolStandings(pool, entries)
      poolWinners(pool, entries, results)
    }
    offs.forEach((o) => o())
    expect(events).toBe(0)
  })
})
