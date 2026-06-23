import { describe, it, expect } from 'vitest'
import { placeWager } from '../../core/index.js'
import {
  addAgent,
  addPlayer,
  addSubAgent,
  bookPending,
  createOrg,
  getMember,
  setBettingLocked,
  setBookBettingLocked,
} from './index.js'

/**
 *   manager
 *     └── sub-agent (sa)
 *           └── agent (a) ── player p1, player p2
 */
function seed() {
  const org = createOrg({ name: 'House', creditLimit: 1_000_000, id: 'mgr' })
  addSubAgent(org, { name: 'Sub', creditLimit: 500_000, id: 'sa' })
  addAgent(org, 'sa', { name: 'Agent', creditLimit: 200_000, id: 'a' })
  addPlayer(org, 'a', { name: 'P1', creditLimit: 10_000, id: 'p1' })
  addPlayer(org, 'a', { name: 'P2', creditLimit: 10_000, id: 'p2' })
  return org
}

describe('setBettingLocked', () => {
  it('locks and unlocks a player, and core then refuses/accepts new bets', () => {
    const org = seed()
    const p1 = getMember(org, 'p1')

    setBettingLocked(org, 'p1', true)
    expect(p1.account.bettingLocked).toBe(true)
    expect(() => placeWager(p1.account, 100)).toThrow(/locked/)

    setBettingLocked(org, 'p1', false)
    expect(p1.account.bettingLocked).toBeUndefined()
    expect(() => placeWager(p1.account, 100)).not.toThrow()
  })

  it('refuses to lock a non-player (they do not wager)', () => {
    const org = seed()
    expect(() => setBettingLocked(org, 'a', true)).toThrow(/only players/)
  })
})

describe('setBookBettingLocked', () => {
  it('freezes every player beneath an agent and reports the count', () => {
    const org = seed()
    const changed = setBookBettingLocked(org, 'a', true)
    expect(changed).toBe(2)
    expect(getMember(org, 'p1').account.bettingLocked).toBe(true)
    expect(getMember(org, 'p2').account.bettingLocked).toBe(true)
    // the agent itself is not a player, so it is untouched
    expect(getMember(org, 'a').account.bettingLocked).toBeUndefined()
  })

  it('only counts players it actually changed (idempotent)', () => {
    const org = seed()
    setBettingLocked(org, 'p1', true) // already locked
    expect(setBookBettingLocked(org, 'a', true)).toBe(1) // only p2 changed
    expect(setBookBettingLocked(org, 'sa', false)).toBe(2) // both unlocked from higher up
    expect(getMember(org, 'p1').account.bettingLocked).toBeUndefined()
  })
})

describe('bookPending', () => {
  it('sums live exposure across the whole downline (and the member itself)', () => {
    const org = seed()
    placeWager(getMember(org, 'p1').account, 1_500)
    placeWager(getMember(org, 'p2').account, 2_500)
    expect(bookPending(org, 'a')).toBe(4_000)
    expect(bookPending(org, 'sa')).toBe(4_000)
    expect(bookPending(org, 'mgr')).toBe(4_000)
    expect(bookPending(org, 'p1')).toBe(1_500) // a leaf is just its own pending
  })
})
