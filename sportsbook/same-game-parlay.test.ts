/**
 * Same-game parlay / bet builder: several markets on ONE game combine into a
 * single ticket, priced through the existing parlay pricer and settled through
 * the existing grade path — the only difference from a straight parlay is that
 * the related-leg policy is opted out of (CLAUDE.md §4). No new pricing or
 * settlement logic.
 */

import { describe, it, expect } from 'vitest'
import type { Account } from '../core/index.js'
import { decimalFromAmerican } from './odds.js'
import { placeTicket, priceTicket, gradeTicket, hasRelatedLegs } from './engine.js'
import type { Selection } from './markets.js'
import {
  sameGameEligible,
  availableBetTypes,
  priceSameGameParlay,
  type SlipSelection,
} from './bets/index.js'

const EVENT = 'nba-lal-bos'
function account(): Account {
  return { id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0 }
}
function sel(over: Partial<Selection>): Selection {
  return { id: 's', eventId: EVENT, market: 'moneyline', pick: 'home', label: 'x', odds: -110, ...over }
}

/** Three markets on the one game (Lakers vs Celtics). */
function sgpLegs(): Selection[] {
  return [
    sel({ id: 'a', market: 'moneyline', pick: 'home', odds: -120, label: 'Lakers' }),
    sel({ id: 'b', market: 'spread', pick: 'home', line: -3, odds: -110, label: 'Lakers -3' }),
    sel({ id: 'c', market: 'total', pick: 'over', line: 220.5, odds: 100, label: 'Over 220.5' }),
  ]
}

const decProduct = (legs: Selection[]) => legs.reduce((a, l) => a * decimalFromAmerican(l.odds), 1)

describe('engine: placing a same-game parlay', () => {
  it('blocks same-game legs as a normal parlay, but allows them with the bet-builder flag', () => {
    const legs = sgpLegs()
    expect(hasRelatedLegs(legs)).toBe(true) // all on one event

    expect(() => placeTicket(account(), { kind: 'parlay', legs, stake: 1000 })).toThrow(/same event/)

    const a = account()
    const t = placeTicket(a, { kind: 'parlay', legs, stake: 1000, sameGameParlay: true })
    expect(t.status).toBe('open')
    expect(a.pending).toBe(1000)
    // priced exactly as a parlay — the odds multiply
    expect(t.oddsDecimal).toBeCloseTo(decProduct(legs), 6)
    expect(priceTicket('parlay', legs)).toBeCloseTo(decProduct(legs), 6)
  })
})

describe('engine: settling a same-game parlay', () => {
  it('pays when every leg wins, off the one game result', () => {
    const a = account()
    const legs = sgpLegs()
    const t = placeTicket(a, { kind: 'parlay', legs, stake: 1000, sameGameParlay: true })
    // Lakers win 118–110: ML home ✓, spread −3 (margin 8) ✓, total 228 > 220.5 ✓
    gradeTicket(a, t, { [EVENT]: { home: 118, away: 110 } })
    expect(t.status).toBe('won')
    expect(t.returned).toBe(Math.round(1000 * decProduct(legs)))
    expect(a.balance).toBe(t.returned! - 1000)
  })

  it('loses the whole ticket the moment one leg loses', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'parlay', legs: sgpLegs(), stake: 1000, sameGameParlay: true })
    // Celtics win: the moneyline-home leg loses → ticket dead.
    gradeTicket(a, t, { [EVENT]: { home: 100, away: 120 } })
    expect(t.status).toBe('lost')
    expect(a.balance).toBe(-1000)
  })

  it('drops a pushed leg and re-prices on the winners', () => {
    const a = account()
    const legs = sgpLegs()
    const t = placeTicket(a, { kind: 'parlay', legs, stake: 1000, sameGameParlay: true })
    // Lakers win by exactly 3 (113–110): ML ✓, spread −3 PUSHES, total 223 > 220.5 ✓.
    gradeTicket(a, t, { [EVENT]: { home: 113, away: 110 } })
    expect(t.status).toBe('won')
    // re-priced on the two winning legs only (the push drops out)
    const winners = decimalFromAmerican(-120) * decimalFromAmerican(100)
    expect(t.oddsDecimal).toBeCloseTo(winners, 6)
    expect(t.returned).toBe(Math.round(1000 * winners))
  })

  it('voids the ticket when the game is not official — stake back', () => {
    const a = account()
    const t = placeTicket(a, { kind: 'parlay', legs: sgpLegs(), stake: 1000, sameGameParlay: true })
    gradeTicket(a, t, { [EVENT]: { home: 118, away: 110, official: false } })
    expect(t.status).toBe('void')
    expect(t.returned).toBe(1000)
    expect(a.balance).toBe(0)
  })
})

describe('slip eligibility for the bet builder', () => {
  const slipSel = (over: Partial<SlipSelection>): SlipSelection => ({
    id: 's',
    eventId: EVENT,
    label: 'x',
    market: 'moneyline',
    decimal: 1.9,
    ...over,
  })

  it('is eligible only when ≥2 legs all sit on the one game', () => {
    const oneGame = { selections: [slipSel({ id: 'a' }), slipSel({ id: 'b', market: 'spread' })] }
    const twoGames = { selections: [slipSel({ id: 'a' }), slipSel({ id: 'b', eventId: 'nfl-kc-buf' })] }
    expect(sameGameEligible(oneGame)).toBe(true)
    expect(sameGameEligible(twoGames)).toBe(false)
    expect(sameGameEligible({ selections: [slipSel({ id: 'a' })] })).toBe(false) // needs ≥2
  })

  it('offers the same-game-parlay type (not a straight parlay) for a one-game slip', () => {
    const oneGame = {
      selections: [slipSel({ id: 'a' }), slipSel({ id: 'b', market: 'spread' as const })],
    }
    const types = availableBetTypes(oneGame)
    expect(types).toContain('sameGameParlay')
    expect(types).not.toContain('parlay') // related legs block the straight parlay
    expect(types).toContain('single')
  })

  it('priceSameGameParlay multiplies the legs like a parlay', () => {
    const oneGame = {
      selections: [slipSel({ id: 'a', decimal: 1.8 }), slipSel({ id: 'b', decimal: 2.0 })],
    }
    const p = priceSameGameParlay(oneGame, 1000)
    expect(p.decimal).toBeCloseTo(3.6, 6)
    expect(p.toReturn).toBe(3600)
  })
})
