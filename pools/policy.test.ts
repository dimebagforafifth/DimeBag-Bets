/** Operator pool policy — manager-gated, gates/clamps player-created pools. Moves no money. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setViewer } from '../app/viewer.js'
import {
  __resetPoolsPolicy,
  canSetPoolsPolicy,
  getPoolsPolicy,
  poolCreationAllowed,
  updatePoolsPolicy,
} from './policy.js'
import { __resetPools, createPool, type CreatePoolInput } from './store.js'
import type { PoolConfig } from './formats/types.js'

const NOW = 1_750_000_000_000
const pickemConfig: PoolConfig = {
  kind: 'pickem',
  games: [{ id: 'g1', label: 'G1', options: ['Home', 'Away'] }],
}

function playerInput(over: Partial<CreatePoolInput> = {}): CreatePoolInput {
  return {
    creatorId: 'p-lena',
    creatorName: 'Lena',
    creatorIsOperator: false,
    name: 'Lena Pool',
    kind: 'pickem',
    scope: 'event',
    privacy: 'public',
    entryCents: 1_000,
    maxEntries: null,
    minEntries: 1,
    guaranteedCents: 0,
    prizeStructure: [1],
    config: pickemConfig,
    lockAt: NOW + 86_400_000,
    now: NOW,
    ...over,
  }
}

beforeEach(() => {
  setViewer('mgr', 'manager')
  __resetPoolsPolicy()
  __resetPools()
})
afterEach(() => setViewer('mgr', 'manager'))

describe('pools policy', () => {
  it('defaults to allowing player-created pools', () => {
    expect(getPoolsPolicy().allowPlayerPools).toBe(true)
    expect(poolCreationAllowed(false)).toBe(true)
  })

  it('the manager can deny player pools (operators still create)', () => {
    updatePoolsPolicy({ allowPlayerPools: false })
    expect(poolCreationAllowed(false)).toBe(false)
    expect(() => createPool(playerInput())).toThrow(/disabled/)
    expect(() =>
      createPool(playerInput({ creatorId: 'mgr', creatorName: 'House', creatorIsOperator: true })),
    ).not.toThrow()
  })

  it('enforces the entry-fee cap on player pools', () => {
    updatePoolsPolicy({ maxEntryCents: 500 })
    expect(() => createPool(playerInput({ entryCents: 1_000 }))).toThrow(/cap/)
    expect(() => createPool(playerInput({ entryCents: 400 }))).not.toThrow()
  })

  it('clamps a player pool to the allowed formats', () => {
    updatePoolsPolicy({ allowedFormats: ['pickem'] })
    const survivorConfig: PoolConfig = { kind: 'survivor', teams: ['A', 'B'], rounds: 1 }
    expect(() => createPool(playerInput({ kind: 'survivor', config: survivorConfig }))).toThrow(
      /allowed/,
    )
  })

  it('is manager-gated', () => {
    setViewer('a-e', 'agent')
    expect(canSetPoolsPolicy()).toBe(false)
    expect(() => updatePoolsPolicy({ rakeBps: 500 })).toThrow(/manager/)
  })

  it('applies the operator rake to a created pool (clamped to the ceiling)', () => {
    updatePoolsPolicy({ rakeBps: 300, maxRakeBps: 500 })
    const pool = createPool(playerInput())
    expect(pool.rakeBps).toBe(300) // players inherit the operator default
    const op = createPool(
      playerInput({ creatorId: 'mgr', creatorIsOperator: true, rakeBps: 9_000 }), // over the ceiling
    )
    expect(op.rakeBps).toBe(500) // clamped to maxRakeBps
  })
})
