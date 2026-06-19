/**
 * The challenge lifecycle, exercised through the store + account book — propose / accept /
 * decline / expire / settle / void, the transition guards, and the money invariants end-to-end
 * (escrow on accept, pot to winner on settle, refund on void) all routed through core.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { Account } from '../core/index.js'
import { createAccountBook, createChallengeStore, type ChallengeStore } from './challenge-store.js'

const NOW = 1_000_000

let alice: Account
let bob: Account
let store: ChallengeStore

beforeEach(() => {
  alice = { id: 'alice', creditLimit: 100_000, balance: 0, pending: 0 }
  bob = { id: 'bob', creditLimit: 100_000, balance: 0, pending: 0 }
  const book = createAccountBook([
    ['alice', alice],
    ['bob', bob],
  ])
  store = createChallengeStore(book)
})

const propose = (over: Partial<Parameters<ChallengeStore['propose']>[0]> = {}) =>
  store.propose({
    proposer: { playerId: 'alice', playerName: 'Alice' },
    title: 'Lakers vs Suns',
    proposerPick: 'Lakers',
    accepterPick: 'Suns',
    proposerStakeCents: 5_000,
    audience: 'open',
    now: NOW,
    ...over,
  })

const bobChallenger = { playerId: 'bob', playerName: 'Bob' }

describe('propose', () => {
  it('creates an open challenge holding no money, deriving the accepter stake from the odds', () => {
    const c = propose({ proposerStakeCents: 5_000, decimalOdds: 1.8 })
    expect(c.status).toBe('open')
    expect(c.proposerStakeCents).toBe(5_000)
    expect(c.accepterStakeCents).toBe(4_000)
    expect(alice.pending).toBe(0) // proposing holds nothing
    expect(bob.pending).toBe(0)
  })

  it('defaults to even money (equal stakes)', () => {
    const c = propose()
    expect(c.accepterStakeCents).toBe(5_000)
    expect(c.decimalOdds).toBe(2)
  })

  it('a friend challenge records the target and requires one', () => {
    const c = propose({ audience: 'friend', targetPlayerId: 'bob', targetPlayerName: 'Bob' })
    expect(c.audience).toBe('friend')
    expect(c.targetPlayerId).toBe('bob')
    expect(c.accepter?.playerId).toBe('bob')
    expect(() => propose({ audience: 'friend' })).toThrow(/target/)
  })
})

describe('accept — escrows both stakes via core', () => {
  it('holds both stakes and flips to accepted', () => {
    const c = propose()
    store.accept(c.id, bobChallenger, NOW)
    expect(store.get(c.id)?.status).toBe('accepted')
    expect(alice.pending).toBe(5_000)
    expect(bob.pending).toBe(5_000)
    expect(alice.balance).toBe(0)
    expect(bob.balance).toBe(0)
  })

  it('respects limits all-or-nothing: a broke accepter leaves both untouched, offer still open', () => {
    bob.creditLimit = 1_000
    const c = propose({ proposerStakeCents: 5_000 })
    expect(() => store.accept(c.id, bobChallenger, NOW)).toThrow()
    expect(alice.pending).toBe(0)
    expect(bob.pending).toBe(0)
    expect(store.get(c.id)?.status).toBe('open') // still acceptable by someone who can cover
  })

  it('refuses to accept your own challenge', () => {
    const c = propose()
    expect(() => store.accept(c.id, { playerId: 'alice', playerName: 'Alice' }, NOW)).toThrow(
      /your own/,
    )
  })

  it('a directed offer can only be accepted by its target', () => {
    const book = createAccountBook([
      ['alice', alice],
      ['bob', bob],
      ['carol', { id: 'carol', creditLimit: 100_000, balance: 0, pending: 0 }],
    ])
    const s = createChallengeStore(book)
    const c = s.propose({
      proposer: { playerId: 'alice', playerName: 'Alice' },
      title: 't',
      proposerPick: 'x',
      accepterPick: 'y',
      proposerStakeCents: 1_000,
      audience: 'friend',
      targetPlayerId: 'bob',
      targetPlayerName: 'Bob',
      now: NOW,
    })
    expect(() => s.accept(c.id, { playerId: 'carol', playerName: 'Carol' }, NOW)).toThrow(
      /someone else/,
    )
    s.accept(c.id, bobChallenger, NOW)
    expect(s.get(c.id)?.status).toBe('accepted')
  })

  it('cannot accept an expired offer', () => {
    const c = propose({ expiresInMs: 1 })
    expect(() => store.accept(c.id, bobChallenger, NOW + 10)).toThrow(/expired/)
    expect(store.get(c.id)?.status).toBe('expired')
  })

  it('cannot re-accept an already accepted challenge', () => {
    const c = propose()
    store.accept(c.id, bobChallenger, NOW)
    expect(() => store.accept(c.id, bobChallenger, NOW)).toThrow(/expected open/)
  })
})

describe('settle — pot to the winner via core', () => {
  it('proposer wins: figure moves, both holds released, house nets zero', () => {
    const c = propose()
    store.accept(c.id, bobChallenger, NOW)
    store.settle(c.id, 'proposer')
    expect(store.get(c.id)?.status).toBe('settled')
    expect(store.get(c.id)?.winner).toBe('proposer')
    expect(alice.balance).toBe(5_000)
    expect(bob.balance).toBe(-5_000)
    expect(alice.balance + bob.balance).toBe(0)
    expect(alice.pending).toBe(0)
    expect(bob.pending).toBe(0)
  })

  it('accepter wins at custom odds: profit equals the proposer’s stake', () => {
    const c = propose({ proposerStakeCents: 5_000, decimalOdds: 1.5 }) // accepter stakes 2500
    store.accept(c.id, bobChallenger, NOW)
    store.settle(c.id, 'accepter')
    expect(bob.balance).toBe(5_000)
    expect(alice.balance).toBe(-5_000)
    expect(alice.balance + bob.balance).toBe(0)
  })

  it('cannot settle an open (un-escrowed) challenge', () => {
    const c = propose()
    expect(() => store.settle(c.id, 'proposer')).toThrow(/expected accepted/)
  })
})

describe('void — refund both via core', () => {
  it('refunds both stakes, no balance change', () => {
    const c = propose()
    store.accept(c.id, bobChallenger, NOW)
    store.voidChallenge(c.id)
    expect(store.get(c.id)?.status).toBe('voided')
    expect(alice.balance).toBe(0)
    expect(bob.balance).toBe(0)
    expect(alice.pending).toBe(0)
    expect(bob.pending).toBe(0)
  })

  it('cannot void an open challenge', () => {
    const c = propose()
    expect(() => store.voidChallenge(c.id)).toThrow(/expected accepted/)
  })
})

describe('decline / expire — no money was ever held', () => {
  it('decline by the invited target marks the offer declined without touching balances', () => {
    const c = propose({ audience: 'friend', targetPlayerId: 'bob', targetPlayerName: 'Bob' })
    store.decline(c.id, 'bob')
    expect(store.get(c.id)?.status).toBe('declined')
    expect(alice.pending).toBe(0)
    expect(bob.pending).toBe(0)
  })

  it('the proposer may withdraw their own open offer', () => {
    const c = propose()
    store.decline(c.id, 'alice')
    expect(store.get(c.id)?.status).toBe('declined')
  })

  it('a non-party cannot decline someone else’s offer (authorization)', () => {
    const c = propose({ audience: 'friend', targetPlayerId: 'bob', targetPlayerName: 'Bob' })
    expect(() => store.decline(c.id, 'carol')).toThrow(/only the invited player or the proposer/)
    expect(store.get(c.id)?.status).toBe('open') // still acceptable by Bob
  })

  it('sweepExpired flips past-due open offers to expired and leaves money alone', () => {
    propose({ expiresInMs: 1 })
    propose({ expiresInMs: 10 * 60_000 }) // still live
    const n = store.sweepExpired(NOW + 1_000)
    expect(n).toBe(1)
    expect(store.all().filter((c) => c.status === 'expired').length).toBe(1)
    expect(store.all().filter((c) => c.status === 'open').length).toBe(1)
    expect(alice.pending).toBe(0)
  })
})

describe('queries', () => {
  it('openFor excludes your own offers and includes directed-to-you', () => {
    propose() // alice → open
    const directed = propose({ audience: 'friend', targetPlayerId: 'bob', targetPlayerName: 'Bob' })
    // bob sees both (an open one + the one directed at him); alice sees neither of her own
    const bobOpen = store.openFor('bob').map((c) => c.id)
    expect(bobOpen).toContain(directed.id)
    expect(store.openFor('alice')).toHaveLength(0)
  })

  it('forPlayer returns challenges a player is a party to', () => {
    const c = propose()
    store.accept(c.id, bobChallenger, NOW)
    expect(store.forPlayer('alice').map((x) => x.id)).toContain(c.id)
    expect(store.forPlayer('bob').map((x) => x.id)).toContain(c.id)
  })

  it('notifies subscribers and bumps the version on each change', () => {
    let ticks = 0
    const off = store.subscribe(() => (ticks += 1))
    const v0 = store.version()
    const c = propose()
    store.accept(c.id, bobChallenger, NOW)
    off()
    expect(ticks).toBeGreaterThanOrEqual(2)
    expect(store.version()).toBeGreaterThan(v0)
  })
})

describe('settle/void actor guard — a participant can never grade their own challenge', () => {
  it('refuses settle/void when the actor is a party, but allows a pure operator (no actor)', () => {
    const c = propose()
    store.accept(c.id, bobChallenger, NOW)
    // a participant identifying itself is refused either way
    expect(() => store.settle(c.id, 'proposer', 'alice')).toThrow(/participant/)
    expect(() => store.settle(c.id, 'accepter', 'bob')).toThrow(/participant/)
    expect(() => store.voidChallenge(c.id, 'bob')).toThrow(/participant/)
    expect(store.get(c.id)?.status).toBe('accepted') // nothing settled by the failed attempts
    // a pure operator (no actor id) settles fine; the pot pays the winner and nets zero
    store.settle(c.id, 'proposer')
    expect(store.get(c.id)?.status).toBe('settled')
    expect(alice.balance + bob.balance).toBe(0)
  })
})
