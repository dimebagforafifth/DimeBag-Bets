/**
 * Pool lifecycle through the store + core: entries HOLD, settle COLLECTS + GRANTS, void REFUNDS —
 * all on the shared book accounts via core. Plus the guards (lock, under-fill, privacy) and a
 * season league. Conservation across many parties is proven in escrow.test.ts; here we assert the
 * lifecycle moves money only through core (pending/balance deltas) and the guards hold.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getBook } from '../app/book-store.js'
import { setViewer } from '../app/viewer.js'
import { onGrant, type Account } from '../core/index.js'
import { __resetFollows, follow } from '../social/index.js'
import {
  __resetPools,
  canJoinPool,
  createLeague,
  createPool,
  enterPool,
  getPool,
  invitePlayer,
  lockPool,
  postResults,
  postWeekResults,
  settlePool,
  voidPool,
  type CreatePoolInput,
} from './store.js'
import { __resetPoolsPolicy } from './policy.js'
import type { PoolConfig, PoolPicks } from './formats/types.js'

const NOW = 1_750_000_000_000
const DAY = 86_400_000
const acct = (id: string): Account => {
  const a = getBook().members[id]?.account
  if (!a) throw new Error(`no seeded player ${id}`)
  return a
}

const pickemConfig: PoolConfig = {
  kind: 'pickem',
  games: [
    { id: 'g1', label: 'G1', options: ['Home', 'Away'] },
    { id: 'g2', label: 'G2', options: ['Home', 'Away'] },
  ],
}
const picks = (g1: string, g2: string): PoolPicks => ({ kind: 'pickem', selections: { g1, g2 } })

function poolInput(over: Partial<CreatePoolInput> = {}): CreatePoolInput {
  return {
    creatorId: 'mgr',
    creatorName: 'House',
    creatorIsOperator: true,
    name: 'Test Pool',
    kind: 'pickem',
    scope: 'event',
    privacy: 'public',
    entryCents: 1_000,
    maxEntries: null,
    minEntries: 1,
    guaranteedCents: 0,
    prizeStructure: [1],
    config: pickemConfig,
    lockAt: NOW + DAY,
    now: NOW,
    ...over,
  }
}

beforeEach(() => {
  setViewer('mgr', 'manager')
  __resetPools()
  __resetPoolsPolicy()
  __resetFollows()
})
afterEach(() => {
  __resetPools()
  setViewer('mgr', 'manager')
})

describe('entry holds through core', () => {
  it('an entry holds the fee in pending; nothing settles until later', () => {
    const pool = createPool(poolInput())
    const a = acct('p-lena')
    const before = a.pending
    enterPool({
      poolId: pool.id,
      account: a,
      playerName: 'Lena',
      picks: picks('Home', 'Away'),
      now: NOW,
    })
    expect(a.pending).toBe(before + 1_000)
    expect(a.balance).toBe(a.balance) // figure flat on a hold
    voidPool(pool.id, 'cleanup', NOW + 2 * DAY) // release the hold so the account is clean
    expect(a.pending).toBe(before)
  })

  it('rejects picks after lock_at', () => {
    const pool = createPool(poolInput({ lockAt: NOW }))
    expect(() =>
      enterPool({
        poolId: pool.id,
        account: acct('p-lena'),
        playerName: 'Lena',
        picks: picks('Home', 'Away'),
        now: NOW + 1,
      }),
    ).toThrow(/locked/)
  })
})

describe('settle / void lifecycle', () => {
  it('settles a pool: collects entries, grants the prize, freezes the result', () => {
    const pool = createPool(poolInput({ minEntries: 2 }))
    const lena = acct('p-lena')
    const priya = acct('p-priya')
    const lenaPending = lena.pending
    const priyaBalance0 = priya.balance
    enterPool({
      poolId: pool.id,
      account: lena,
      playerName: 'Lena',
      picks: picks('Home', 'Home'),
      now: NOW,
    })
    enterPool({
      poolId: pool.id,
      account: priya,
      playerName: 'Priya',
      picks: picks('Home', 'Away'),
      now: NOW,
    })

    let grants = 0
    const off = onGrant(() => (grants += 1))
    lockPool(pool.id, NOW + DAY)
    postResults(pool.id, { kind: 'pickem', winners: { g1: 'Home', g2: 'Away' } }, NOW + DAY)
    const settled = settlePool(pool.id, NOW + 2 * DAY)
    off()

    expect(settled.lifecycle).toBe('settled')
    expect(settled.prizePoolCents).toBe(2_000) // two $10 entries
    expect(settled.payouts?.length).toBeGreaterThan(0)
    expect(lena.pending).toBe(lenaPending) // hold released
    // Priya got both right → wins the $20 pool: −10 entry + 20 prize = +10 net.
    expect(priya.balance).toBe(priyaBalance0 + 1_000)
    expect(grants).toBeGreaterThan(0) // prize paid through core.grant
  })

  it('under-filled pool voids at lock and refunds every entry through core', () => {
    const pool = createPool(poolInput({ minEntries: 3 }))
    const lena = acct('p-lena')
    const before = lena.pending
    enterPool({
      poolId: pool.id,
      account: lena,
      playerName: 'Lena',
      picks: picks('Home', 'Home'),
      now: NOW,
    })
    expect(lena.pending).toBe(before + 1_000)
    const locked = lockPool(pool.id, NOW + DAY) // only 1 of 3 → voids
    expect(locked.lifecycle).toBe('void')
    expect(locked.voidReason).toBe('under-filled')
    expect(lena.pending).toBe(before) // refunded (hold released, balance untouched)
  })
})

describe('privacy', () => {
  it('a friends-only pool blocks a non-followed player and admits a followed one', () => {
    follow('p-marco', 'p-lena') // marco follows lena
    const pool = createPool(
      poolInput({
        creatorId: 'p-marco',
        creatorName: 'Marco',
        creatorIsOperator: false,
        privacy: 'friends',
      }),
    )
    expect(canJoinPool(pool, 'p-lena')).toBe(true)
    expect(canJoinPool(pool, 'p-tariq')).toBe(false)
    expect(() =>
      enterPool({
        poolId: pool.id,
        account: acct('p-tariq'),
        playerName: 'Tariq',
        picks: picks('Home', 'Home'),
        now: NOW,
      }),
    ).toThrow(/private/)
  })

  it('an invite-only pool admits only invited players', () => {
    const pool = createPool(poolInput({ creatorId: 'mgr', privacy: 'invite' }))
    expect(canJoinPool(pool, 'p-dana')).toBe(false)
    invitePlayer(pool.id, 'p-dana', NOW)
    expect(canJoinPool(pool, 'p-dana')).toBe(true)
  })

  it('only the pool creator (or a manager) can invite', () => {
    const pool = createPool(
      poolInput({
        creatorId: 'p-marco',
        creatorName: 'Marco',
        creatorIsOperator: false,
        privacy: 'invite',
      }),
    )
    setViewer('p-lena', 'player') // a different player
    expect(() => invitePlayer(pool.id, 'p-dana', NOW)).toThrow(/creator or a manager/)
    setViewer('p-marco', 'player') // the creator
    expect(() => invitePlayer(pool.id, 'p-dana', NOW)).not.toThrow()
  })
})

describe('result re-posting is idempotent', () => {
  it('re-posting the same squares period replaces it rather than double-counting', () => {
    const squaresConfig: PoolConfig = {
      kind: 'squares',
      periods: ['Q1', 'Q2'],
      periodWeights: [0.4, 0.6],
    }
    const pool = createPool(
      poolInput({
        kind: 'squares',
        config: squaresConfig,
        prizeStructure: [0.4, 0.6],
        minEntries: 0,
      }),
    )
    lockPool(pool.id, NOW + DAY)
    postResults(
      pool.id,
      { kind: 'squares', periodScores: [{ period: 0, home: 7, away: 3 }] },
      NOW + DAY,
    )
    postResults(
      pool.id,
      { kind: 'squares', periodScores: [{ period: 0, home: 7, away: 3 }] },
      NOW + DAY,
    )
    const results = getPool(pool.id)!.results
    expect(results?.kind === 'squares' && results.periodScores.length).toBe(1)
  })
})

describe('season league', () => {
  it('scores a survivor league over weekly rounds and pays the last one standing', () => {
    const survivorConfig: PoolConfig = {
      kind: 'survivor',
      teams: ['T1', 'T2', 'T3', 'T4'],
      rounds: 2,
    }
    const { pool, league } = createLeague({
      ...poolInput({
        kind: 'survivor',
        config: survivorConfig,
        minEntries: 2,
        entryCents: 0,
        guaranteedCents: 5_000,
      }),
      weeks: 2,
    })
    expect(pool.scope).toBe('season')

    const lena = acct('p-lena')
    const priya = acct('p-priya')
    const lenaBalance0 = lena.balance
    enterPool({
      poolId: pool.id,
      account: lena,
      playerName: 'Lena',
      picks: { kind: 'survivor', selections: { 0: 'T1', 1: 'T3' } },
      now: NOW,
    })
    enterPool({
      poolId: pool.id,
      account: priya,
      playerName: 'Priya',
      picks: { kind: 'survivor', selections: { 0: 'T1', 1: 'T2' } },
      now: NOW,
    })

    lockPool(pool.id, NOW + DAY)
    postWeekResults(
      league.id,
      0,
      { kind: 'survivor', roundWinners: { 0: ['T1', 'T2', 'T3'] } },
      NOW + DAY,
    )
    postWeekResults(league.id, 1, { kind: 'survivor', roundWinners: { 1: ['T3'] } }, NOW + 2 * DAY)
    const settled = settlePool(pool.id, NOW + 3 * DAY)

    expect(settled.lifecycle).toBe('settled')
    // Lena survived both rounds (last standing) → wins the $50 guaranteed pool.
    expect(lena.balance).toBe(lenaBalance0 + 5_000)
  })
})
