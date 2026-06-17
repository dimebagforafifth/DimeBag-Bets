/**
 * Tail / fade routes through the REAL book placement path → core. Proves: a tail places a
 * genuine core wager (holds pending, records a BookBet), respects the player's own limits
 * (over availableToWager throws, placing nothing), and a fade inverts a single leg.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mockSlate } from '../app/book/mockBook.js'
import { legFromSelection, type SlipLeg } from '../app/book/slip.js'
import { __resetBets, getBets } from '../app/book/bets-store.js'
import { __resetPlacement } from '../app/book/placement.js'
import type { Account } from '../core/index.js'
import type { NormalizedEvent } from '../lib/odds/contract.js'
import { tailSlip, fadeSlip, oppositeLeg, canFade } from './tail.js'
import type { SharedSlip } from './types.js'

const slate: NormalizedEvent[] = mockSlate()

/** Build a leg from the slate by event + market type + side. */
function legOf(eventId: string, type: SlipLeg['marketType'], side: string, playerId?: string): SlipLeg {
  const event = slate.find((e) => e.eventId === eventId)!
  const market = event.markets.find(
    (m) => m.type === type && !m.marketId.includes('-alt') && (playerId ? m.playerId === playerId : !m.playerId),
  )!
  const sel = market.selections.find((s) => s.side === side)!
  return legFromSelection(event, market, sel)
}

function slip(legs: SlipLeg[], over: Partial<SharedSlip> = {}): SharedSlip {
  return {
    id: 's1',
    playerId: 'p-lena',
    playerName: 'Lena',
    legs,
    mode: legs.length > 1 ? 'parlay' : 'single',
    stakeCents: 5_000,
    decimal: legs[0]?.price.decimal ?? 1,
    status: 'open',
    sharedAt: 0,
    visibility: 'public',
    reactions: [],
    comments: [],
    ...over,
  }
}

function account(over: Partial<Account> = {}): Account {
  return { id: 'p-marco', creditLimit: 100_000, balance: 0, pending: 0, ...over }
}

beforeEach(() => {
  __resetBets()
  __resetPlacement()
})

describe('tailSlip', () => {
  it('places a REAL core-routed bet copying the friend’s legs (holds pending, records it)', () => {
    const acct = account()
    const s = slip([legOf('nba-lal-bos', 'moneyline', 'home')]) // Lakers ML
    const placed = tailSlip({ slip: s, account: acct, playerName: 'Marco', stakeCents: 5_000, now: 1 })

    expect(placed).toHaveLength(1)
    expect(acct.pending).toBe(5_000) // stake is held in core
    const recorded = getBets()
    expect(recorded).toHaveLength(1)
    expect(recorded[0].accountId).toBe('p-marco')
    expect(recorded[0].legs[0].side).toBe('home') // same selection as the friend
    expect(recorded[0].placedBy).toBe('Marco')
  })

  it('tails a parlay as one wager (same mode)', () => {
    const acct = account()
    const legs = [
      legOf('nfl-kc-buf', 'moneyline', 'home'),
      legOf('nfl-kc-buf', 'prop', 'over', 'P. Mahomes'),
    ]
    const s = slip(legs, { mode: 'parlay' })
    const placed = tailSlip({ slip: s, account: acct, playerName: 'Marco', stakeCents: 3_000, now: 1 })
    expect(placed).toHaveLength(1)
    expect(placed[0].mode).toBe('parlay')
    expect(acct.pending).toBe(3_000) // one stake, not per-leg
  })

  it('respects the player’s own limits — over availableToWager throws, placing nothing', () => {
    const acct = account({ creditLimit: 5_000 }) // available = 5_000
    const s = slip([legOf('nba-lal-bos', 'moneyline', 'home')])
    expect(() =>
      tailSlip({ slip: s, account: acct, playerName: 'Marco', stakeCents: 6_000, now: 1 }),
    ).toThrow(/exceeds available/)
    expect(acct.pending).toBe(0) // nothing held
    expect(getBets()).toHaveLength(0) // nothing recorded
  })

  it('respects a per-head max bet', () => {
    const acct = account({ maxWager: 2_000 })
    const s = slip([legOf('nba-lal-bos', 'moneyline', 'home')])
    expect(() =>
      tailSlip({ slip: s, account: acct, playerName: 'Marco', stakeCents: 3_000, now: 1 }),
    ).toThrow()
    expect(getBets()).toHaveLength(0)
  })
})

describe('fadeSlip', () => {
  it('inverts a single leg to the opposite side and places it through core', () => {
    const acct = account()
    const s = slip([legOf('nba-lal-bos', 'moneyline', 'home')]) // Lakers (home)
    const placed = fadeSlip({ slip: s, account: acct, playerName: 'Marco', slate, stakeCents: 4_000, now: 1 })
    expect(placed).toHaveLength(1)
    expect(placed[0].legs[0].side).toBe('away') // Celtics — the opposite
    expect(placed[0].legs[0].eventId).toBe('nba-lal-bos')
    expect(acct.pending).toBe(4_000)
  })

  it('mirrors a spread line when fading', () => {
    const home = legOf('nfl-kc-buf', 'spread', 'home') // Chiefs -1.5
    const opp = oppositeLeg(home, slate)!
    expect(opp.side).toBe('away')
    expect(opp.line).toBe(-(home.line ?? 0)) // +1.5
  })

  it('refuses to fade a parlay (no single opposite)', () => {
    const acct = account()
    const s = slip(
      [legOf('nfl-kc-buf', 'moneyline', 'home'), legOf('nfl-kc-buf', 'prop', 'over', 'P. Mahomes')],
      { mode: 'parlay' },
    )
    expect(() =>
      fadeSlip({ slip: s, account: acct, playerName: 'Marco', slate, stakeCents: 1_000, now: 1 }),
    ).toThrow(/single/)
    expect(canFade(s, slate)).toBe(false)
  })

  it('canFade is true for a single with an opposite on the board', () => {
    expect(canFade(slip([legOf('nba-lal-bos', 'moneyline', 'home')]), slate)).toBe(true)
  })
})
