/**
 * Per-head controls + member lifecycle on the book: the operator's max-bet
 * lever, renaming, and safe removal (with the money-model guards).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  addAgent,
  addPlayer,
  addSubAgent,
  createOrg,
  getMember,
  removeMember,
  renameMember,
  setMaxWager,
  type Org,
} from './index.js'

let org: Org
beforeEach(() => {
  org = createOrg({ name: 'Book', creditLimit: 1_000_000, id: 'mgr' })
  addSubAgent(org, { name: 'Region', creditLimit: 500_000, id: 'sa' })
  addAgent(org, 'sa', { name: 'Desk', creditLimit: 200_000, id: 'a' })
  addPlayer(org, 'a', { name: 'Pat', creditLimit: 50_000, id: 'p' })
})

describe('setMaxWager', () => {
  it('sets and clears a player per-head cap', () => {
    setMaxWager(org, 'p', 2_000)
    expect(getMember(org, 'p').account.maxWager).toBe(2_000)
    setMaxWager(org, 'p', null)
    expect(getMember(org, 'p').account.maxWager).toBeUndefined()
  })

  it('rejects a non-player (agents/sub-agents do not wager)', () => {
    expect(() => setMaxWager(org, 'a', 1_000)).toThrow(/only players/)
    expect(() => setMaxWager(org, 'mgr', 1_000)).toThrow(/only players/)
  })

  it('rejects a non-positive or non-integer cap', () => {
    expect(() => setMaxWager(org, 'p', 0)).toThrow(/≥ 1/)
    expect(() => setMaxWager(org, 'p', 1.5)).toThrow(/whole number/)
  })
})

describe('renameMember', () => {
  it('renames and trims', () => {
    renameMember(org, 'p', '  Patricia  ')
    expect(getMember(org, 'p').name).toBe('Patricia')
  })
  it('rejects an empty name', () => {
    expect(() => renameMember(org, 'p', '   ')).toThrow(/empty/)
  })
})

describe('removeMember', () => {
  it('removes a settled, childless member', () => {
    removeMember(org, 'p')
    expect(org.members.p).toBeUndefined()
  })

  it('refuses to remove the manager', () => {
    expect(() => removeMember(org, 'mgr')).toThrow(/manager/)
  })

  it('refuses to remove a member that still has a downline', () => {
    expect(() => removeMember(org, 'a')).toThrow(/under them/)
    // removing bottom-up works
    removeMember(org, 'p')
    removeMember(org, 'a')
    expect(org.members.a).toBeUndefined()
  })

  it('refuses to remove a member still carrying a figure', () => {
    getMember(org, 'p').account.balance = -5_000 // owes the book
    expect(() => removeMember(org, 'p')).toThrow(/figure/)
    getMember(org, 'p').account.balance = 0
    expect(() => removeMember(org, 'p')).not.toThrow()
  })

  it('refuses to remove a member with a live pending bet', () => {
    getMember(org, 'p').account.pending = 1_000
    expect(() => removeMember(org, 'p')).toThrow(/pending/)
  })
})
