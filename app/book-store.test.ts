import { describe, it, expect } from 'vitest'
import { placeWager, resolveWager, resolveAtMultiplier } from '../core/index.js'
import { bookFigure, getMember, setActive } from '../features/org/index.js'
import {
  getBook,
  getBookVersion,
  getCurrentPlayer,
  getCurrentPlayerId,
  listPlayers,
  migrateOrg,
  mutateBook,
  setCurrentPlayer,
  subscribeBook,
} from './book-store.js'
import type { Org } from '../features/org/index.js'

/**
 * The keystone: the book store hands the casino/sportsbook a real org PLAYER's
 * core Account, so play moves that player's figure and rolls up the tree. These
 * tests exercise the live singleton (it falls back to an in-memory KV store
 * outside the browser), so they run in declared order.
 */
describe('book store — v1→v2 migration backfills member profiles', () => {
  // a pre-profile (v1) book shape: members with no `profile` field
  const v1 = () => ({
    managerId: 'm',
    members: {
      m: { id: 'm', role: 'manager', name: 'Mgr', parentId: null, active: true,
        account: { id: 'm', creditLimit: 100, balance: 5, pending: 0 } },
      p: { id: 'p', role: 'player', name: 'P', parentId: 'm', active: true, profile: { nickname: 'keep' },
        account: { id: 'p', creditLimit: 50, balance: -7, pending: 0 } },
    },
  })

  it('gives every member a profile object without touching money, idempotently', () => {
    const migrated = migrateOrg(v1(), 1) as Org
    expect(migrated.members.m.profile).toEqual({}) // backfilled
    expect(migrated.members.p.profile).toEqual({ nickname: 'keep' }) // existing profile left intact
    expect(migrated.members.p.account.balance).toBe(-7) // figure untouched
  })

  it('falls back to a fresh seed on a structurally-corrupt doc instead of throwing', () => {
    const bad: unknown[] = [
      null,
      undefined,
      42,
      {},
      { managerId: 'm' }, // no members map
      { managerId: 'm', members: {} }, // managerId not present in members
      { managerId: 'm', members: { x: { id: 'x' } } }, // member without an account
      { managerId: 'm', members: {
        m: { id: 'm', account: { id: 'm', creditLimit: 0, balance: 0, pending: 0 } },
        bad: { id: 'bad' }, // a member missing its account
      } },
    ]
    for (const d of bad) {
      const out = migrateOrg(d, 1)
      expect(out.managerId).toBeTruthy()
      expect(out.members[out.managerId]).toBeTruthy() // a usable seed, never a throw
    }
  })

  it('replaces a newer (rolled-back) doc with a seed rather than mangling it', () => {
    const future = v1()
    const out = migrateOrg(future, 3)
    expect(out).not.toBe(future) // seeded, not the unknown future shape
    expect(out.members[out.managerId]).toBeTruthy()
  })
})

describe('book store — play ↔ org integration', () => {
  it('seeds a book with players and a valid current player', () => {
    expect(listPlayers().length).toBeGreaterThan(0)
    const cur = getCurrentPlayer()
    expect(cur).not.toBeNull()
    expect(cur!.role).toBe('player')
  })

  it("a losing wager on the current player moves their figure and rolls up to the agent", () => {
    const player = getCurrentPlayer()!
    const org = getBook()
    const parentId = player.parentId!
    const figBefore = player.account.balance
    const rollupBefore = bookFigure(org, parentId)

    const w = placeWager(player.account, 500) // $5 hold
    resolveWager(player.account, w, 'loss')

    expect(player.account.balance).toBe(figBefore - 500)
    expect(player.account.pending).toBe(0)
    // the loss is now part of the agent's whole book
    expect(bookFigure(org, parentId)).toBe(rollupBefore - 500)
  })

  it('a winning wager rolls up the same way (fractional settle path)', () => {
    const player = getCurrentPlayer()!
    const org = getBook()
    const figBefore = player.account.balance
    const rootBefore = bookFigure(org, org.managerId)

    const w = placeWager(player.account, 1000) // $10
    resolveAtMultiplier(player.account, w, 2.5) // returns $25 → +$15 profit

    expect(player.account.balance).toBe(figBefore + 1500)
    // it bubbles all the way to the manager's whole-operation figure
    expect(bookFigure(org, org.managerId)).toBe(rootBefore + 1500)
  })

  it('every resolution bumps the version + notifies (drives React + persistence)', () => {
    const player = getCurrentPlayer()!
    let notified = 0
    const unsub = subscribeBook(() => {
      notified++
    })
    const v0 = getBookVersion()
    const w = placeWager(player.account, 200)
    resolveWager(player.account, w, 'push') // stake returned, but still an event
    expect(getBookVersion()).toBeGreaterThan(v0)
    expect(notified).toBeGreaterThan(0)
    unsub()
  })

  it('switching the active player is validated against the tree', () => {
    const other = listPlayers().find((p) => p.id !== getCurrentPlayerId())!
    setCurrentPlayer(other.id)
    expect(getCurrentPlayerId()).toBe(other.id)
    expect(getCurrentPlayer()!.id).toBe(other.id)
    // can't play as a non-player (an agent/sub-agent/the manager)
    expect(() => setCurrentPlayer('mgr')).toThrow(/not a player/)
  })

  it('a suspended player is not playable and play falls back to an active one', () => {
    const a = listPlayers().find((p) => p.active)!
    setCurrentPlayer(a.id)
    expect(getCurrentPlayer()!.id).toBe(a.id)

    // suspend the player we're playing as, through a book mutation
    mutateBook((o) => setActive(o, a.id, false))

    // we auto-fall-back to a DIFFERENT active player (never the suspended one)
    const cur = getCurrentPlayer()
    expect(cur).not.toBeNull()
    expect(cur!.id).not.toBe(a.id)
    expect(cur!.active).toBe(true)

    // and you can't explicitly switch onto a suspended player
    expect(() => setCurrentPlayer(a.id)).toThrow(/suspended/)

    mutateBook((o) => setActive(o, a.id, true)) // restore for later tests
  })

  it('mutateBook applies a change and bumps the version', () => {
    const before = getMember(getBook(), 'p-lena').account.creditLimit
    const v0 = getBookVersion()
    mutateBook((o) => {
      o.members['p-lena'].account.creditLimit = before + 1000
    })
    expect(getMember(getBook(), 'p-lena').account.creditLimit).toBe(before + 1000)
    expect(getBookVersion()).toBeGreaterThan(v0)
  })
})
