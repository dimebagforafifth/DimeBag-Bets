/**
 * The money path — proven against core directly. These tests are the heart of the lane: they
 * show escrow holds BOTH stakes via core, settlement pays the pot to the winner, void refunds
 * both, and — the load-bearing invariant — the POT IN EQUALS THE POT OUT with the house netting
 * exactly zero across every stake/odds/winner combination.
 */

import { describe, expect, it } from 'vitest'
import { availableToWager, type Account } from '../core/index.js'
import { escrowStakes, settleStakes, voidStakes } from './escrow.js'
import { accepterStakeFor } from './odds.js'

const acct = (id: string, over: Partial<Account> = {}): Account => ({
  id,
  creditLimit: 100_000,
  balance: 0,
  pending: 0,
  ...over,
})

describe('escrowStakes — holds both sides via core', () => {
  it('moves both stakes into pending, leaving balances untouched', () => {
    const a = acct('a')
    const b = acct('b')
    escrowStakes(a, 5_000, b, 5_000)
    expect(a.pending).toBe(5_000)
    expect(b.pending).toBe(5_000)
    expect(a.balance).toBe(0)
    expect(b.balance).toBe(0)
    // availableToWager fell by exactly each stake — the hold is real, via core.
    expect(availableToWager(a)).toBe(95_000)
    expect(availableToWager(b)).toBe(95_000)
  })

  it('is all-or-nothing: if the proposer can’t cover, the accepter’s hold is released', () => {
    const a = acct('a', { creditLimit: 1_000 }) // proposer can only cover 1000
    const b = acct('b')
    expect(() => escrowStakes(a, 5_000, b, 5_000)).toThrow()
    // nothing stranded — both accounts exactly as before
    expect(a.pending).toBe(0)
    expect(b.pending).toBe(0)
    expect(a.balance).toBe(0)
    expect(b.balance).toBe(0)
  })

  it('respects the accepter’s limits (and never touches the proposer when the accepter fails)', () => {
    const a = acct('a')
    const b = acct('b', { creditLimit: 1_000 })
    expect(() => escrowStakes(a, 5_000, b, 5_000)).toThrow()
    expect(a.pending).toBe(0)
    expect(b.pending).toBe(0)
  })

  it('honours a betting lock and a max bet (core’s checks, not re-implemented)', () => {
    const locked = acct('a', { bettingLocked: true })
    expect(() => escrowStakes(locked, 1_000, acct('b'), 1_000)).toThrow(/locked/)
    const capped = acct('b', { maxWager: 2_000 })
    expect(() => escrowStakes(acct('a'), 1_000, capped, 5_000)).toThrow(/max bet/)
  })

  it('refuses a self-match (one account can’t be both sides of a pot)', () => {
    const a = acct('a')
    expect(() => escrowStakes(a, 1_000, a, 1_000)).toThrow(/own challenge/)
    expect(a.pending).toBe(0)
  })

  it('refuses a match whose pot would pay a participant past their max payout (keeps zero-sum)', () => {
    // The accepter's win would be the proposer's 5000 stake, but their cap is 2000 → core would
    // clip the win and leak credits. Refuse up front, holding nothing.
    const proposer = acct('a')
    const capped = acct('b', { maxPayout: 2_000 })
    expect(() => escrowStakes(proposer, 5_000, capped, 5_000)).toThrow(/max payout/)
    expect(proposer.pending).toBe(0)
    expect(capped.pending).toBe(0)
    // Symmetric: the proposer's cap is checked against the accepter's stake too.
    const cappedProposer = acct('a', { maxPayout: 1_000 })
    expect(() => escrowStakes(cappedProposer, 1_000, acct('b'), 5_000)).toThrow(/max payout/)
  })
})

describe('settleStakes — winner takes the pot, house nets zero', () => {
  it('even money: proposer wins → +loser stake to proposer, −stake from accepter', () => {
    const a = acct('a')
    const b = acct('b')
    const escrow = escrowStakes(a, 5_000, b, 5_000)
    settleStakes(a, b, escrow, 'proposer')
    expect(a.balance).toBe(5_000) // won the accepter's stake
    expect(b.balance).toBe(-5_000) // lost their stake
    expect(a.pending).toBe(0)
    expect(b.pending).toBe(0)
    expect(a.balance + b.balance).toBe(0) // zero house leakage
  })

  it('custom odds: accepter wins → profit equals the proposer’s (larger) stake', () => {
    const a = acct('a')
    const b = acct('b')
    const proposerStake = 5_000
    const accepterStake = accepterStakeFor(proposerStake, 1.8) // 4000
    const escrow = escrowStakes(a, proposerStake, b, accepterStake)
    settleStakes(a, b, escrow, 'accepter')
    expect(b.balance).toBe(proposerStake) // accepter won the proposer's 5000
    expect(a.balance).toBe(-proposerStake) // proposer lost their 5000
    expect(a.balance + b.balance).toBe(0)
    expect(a.pending).toBe(0)
    expect(b.pending).toBe(0)
  })

  it('refuses to settle (atomically) if the winner’s cap was LOWERED after escrow — pot conserved', () => {
    const a = acct('a')
    const b = acct('b')
    const escrow = escrowStakes(a, 5_000, b, 5_000) // accepted with no cap
    a.maxPayout = 2_000 // operator lowers the (would-be) winner's cap mid-flight
    expect(() => settleStakes(a, b, escrow, 'proposer')).toThrow(/max payout/)
    // atomic: the throw happened before any resolve — both stakes still held, no balance moved
    expect(a.pending).toBe(5_000)
    expect(b.pending).toBe(5_000)
    expect(a.balance).toBe(0)
    expect(b.balance).toBe(0)
    // and the operator can still void to refund both — zero credits leaked anywhere
    voidStakes(a, b, escrow)
    expect(a.pending).toBe(0)
    expect(b.pending).toBe(0)
    expect(a.balance).toBe(0)
    expect(b.balance).toBe(0)
  })

  it('the pot the two put in is exactly the pot the winner takes out', () => {
    const a = acct('a')
    const b = acct('b')
    const escrow = escrowStakes(a, 4_000, b, 2_000) // pot 6000
    const beforeTotal = a.balance + b.balance
    settleStakes(a, b, escrow, 'proposer')
    // proposer's gain (2000) == accepter's loss (2000); system total unchanged
    expect(a.balance + b.balance).toBe(beforeTotal)
    expect(a.balance).toBe(2_000)
    expect(b.balance).toBe(-2_000)
  })
})

describe('voidStakes — refunds both via core', () => {
  it('releases both holds with no balance change (stake returned)', () => {
    const a = acct('a')
    const b = acct('b')
    const escrow = escrowStakes(a, 3_000, b, 3_000)
    voidStakes(a, b, escrow)
    expect(a.pending).toBe(0)
    expect(b.pending).toBe(0)
    expect(a.balance).toBe(0)
    expect(b.balance).toBe(0)
  })
})

describe('zero-leakage invariant — exhaustive over stakes × odds × winner', () => {
  const proposerStakes = [1, 100, 2_500, 5_000, 33_333, 99_999]
  const oddsGrid = [1.01, 1.25, 1.5, 1.8, 2, 2.5, 3, 4.75]

  it('every settle conserves total credits and nets the house to zero', () => {
    for (const ps of proposerStakes) {
      for (const d of oddsGrid) {
        const accepterStake = accepterStakeFor(ps, d)
        for (const winner of ['proposer', 'accepter'] as const) {
          const a = acct('a', { creditLimit: 1_000_000 })
          const b = acct('b', { creditLimit: 1_000_000 })
          const escrow = escrowStakes(a, ps, b, accepterStake)
          const pot = ps + accepterStake
          settleStakes(a, b, escrow, winner)
          // house nets zero: the two figures sum to zero
          expect(a.balance + b.balance).toBe(0)
          // pending fully released
          expect(a.pending).toBe(0)
          expect(b.pending).toBe(0)
          // the winner's gain is exactly the loser's stake; the pot is conserved
          const winnerStake = winner === 'proposer' ? ps : accepterStake
          const loserStake = pot - winnerStake
          const winnerAcct = winner === 'proposer' ? a : b
          const loserAcct = winner === 'proposer' ? b : a
          expect(winnerAcct.balance).toBe(loserStake)
          expect(loserAcct.balance).toBe(-loserStake)
        }
      }
    }
  })

  it('every void conserves total credits exactly (both refunded)', () => {
    for (const ps of proposerStakes) {
      for (const d of oddsGrid) {
        const a = acct('a', { creditLimit: 1_000_000 })
        const b = acct('b', { creditLimit: 1_000_000 })
        const escrow = escrowStakes(a, ps, b, accepterStakeFor(ps, d))
        voidStakes(a, b, escrow)
        expect(a.balance).toBe(0)
        expect(b.balance).toBe(0)
        expect(a.pending).toBe(0)
        expect(b.pending).toBe(0)
      }
    }
  })
})
