/**
 * Public splits — the pure projection. Built over a CONSTRUCTED ledger of recorded bets:
 * bets % and handle % sum to 100 across a market's sides; the projection reconciles to its
 * inputs (mints nothing); parlays ride their whole stake on each leg's market; the most-bet
 * ranking is deterministic. No money moves here.
 */

import { describe, expect, it } from 'vitest'
import type { BookBet } from '../../app/book/bets-store.js'
import type { SlipLeg } from '../../app/book/slip.js'
import {
  marketSplits,
  mostBetMarkets,
  reconcile,
  roundShares,
  splitForMarket,
  toSplitBets,
} from './splits.js'

const leg = (over: Partial<SlipLeg> & { marketId: string; side: string }): SlipLeg => ({
  key: `${over.marketId}:${over.side}:${Math.round(Math.abs((over.line ?? 0) * 1000))}`,
  eventId: over.eventId ?? 'e1',
  eventLabel: over.eventLabel ?? 'Away @ Home',
  leagueId: over.leagueId ?? 'NBA',
  marketType: over.marketType ?? 'moneyline',
  marketPeriod: 'game',
  pick: over.pick ?? over.side,
  price: over.price ?? { american: -110, decimal: 1.91 },
  sport: over.sport ?? 'BASKETBALL',
  ...over,
})

const bet = (
  id: string,
  accountId: string,
  stakeCents: number,
  legs: SlipLeg[],
  status: BookBet['status'] = 'open',
): BookBet => ({
  id,
  accountId,
  playerName: accountId,
  placedBy: accountId,
  mode: legs.length > 1 ? 'parlay' : 'single',
  legs,
  stakeCents,
  decimal: legs[0].price.decimal,
  status,
  placedAt: 0,
})

describe('market split — bets % vs handle %', () => {
  // m1 moneyline: HOME 3 tickets / $40 handle, AWAY 2 tickets / $20 handle.
  const bets: BookBet[] = [
    bet('b1', 'a', 1_000, [leg({ marketId: 'm1', side: 'home' })]),
    bet('b2', 'b', 1_000, [leg({ marketId: 'm1', side: 'home' })]),
    bet('b3', 'c', 2_000, [leg({ marketId: 'm1', side: 'home' })]),
    bet('b4', 'd', 1_000, [leg({ marketId: 'm1', side: 'away' })]),
    bet('b5', 'e', 1_000, [leg({ marketId: 'm1', side: 'away' })]),
  ]
  const split = marketSplits(toSplitBets(bets)).get('m1')!

  it('totals the tickets and handle on the market', () => {
    expect(split.totalTickets).toBe(5)
    expect(split.totalHandleCents).toBe(6_000)
  })

  it('computes per-side bets % and handle %', () => {
    const home = split.sides.find((s) => s.side === 'home')!
    const away = split.sides.find((s) => s.side === 'away')!
    expect(home.tickets).toBe(3)
    expect(home.handleCents).toBe(4_000)
    expect(home.ticketPct).toBeCloseTo(60)
    expect(home.handlePct).toBeCloseTo((4_000 / 6_000) * 100)
    expect(away.ticketPct).toBeCloseTo(40)
    expect(away.handlePct).toBeCloseTo((2_000 / 6_000) * 100)
  })

  it('sides’ bets % and handle % each sum to 100', () => {
    const tixSum = split.sides.reduce((s, x) => s + x.ticketPct, 0)
    const handleSum = split.sides.reduce((s, x) => s + x.handlePct, 0)
    expect(tixSum).toBeCloseTo(100)
    expect(handleSum).toBeCloseTo(100)
  })

  it('sorts sides by handle (the public’s heaviest side first)', () => {
    expect(split.sides[0].side).toBe('home') // $40 > $20
  })

  it('handles a three-way market where the percents still sum to 100', () => {
    const three = toSplitBets([
      bet('t1', 'a', 1_000, [leg({ marketId: 'm3', side: 'a' })]),
      bet('t2', 'b', 1_000, [leg({ marketId: 'm3', side: 'b' })]),
      bet('t3', 'c', 1_000, [leg({ marketId: 'm3', side: 'c' })]),
    ])
    const s = splitForMarket(three, 'm3')!
    expect(s.sides).toHaveLength(3)
    expect(s.sides.reduce((acc, x) => acc + x.ticketPct, 0)).toBeCloseTo(100)
    expect(s.sides.reduce((acc, x) => acc + x.handlePct, 0)).toBeCloseTo(100)
  })
})

describe('reconciliation — the projection mints nothing', () => {
  it('Σ market totals equal Σ recorded legs / stake-per-leg (incl. parlays)', () => {
    const bets: BookBet[] = [
      bet('s1', 'a', 1_500, [leg({ marketId: 'm1', side: 'home' })]),
      bet('s2', 'b', 2_500, [leg({ marketId: 'm2', side: 'over', marketType: 'total' })]),
      // a 2-leg parlay: its whole $50 stake rides BOTH legs' markets, 1 ticket each.
      bet('p1', 'c', 5_000, [
        leg({ marketId: 'm1', side: 'away' }),
        leg({ marketId: 'm2', side: 'under', marketType: 'total' }),
      ]),
    ]
    const rows = toSplitBets(bets)
    const recon = reconcile(rows)
    expect(recon.tickets).toBe(4) // 1 + 1 + 2 legs
    expect(recon.handleCents).toBe(1_500 + 2_500 + 5_000 + 5_000) // parlay stake counted per leg

    const splits = [...marketSplits(rows).values()]
    const tixSum = splits.reduce((s, m) => s + m.totalTickets, 0)
    const handleSum = splits.reduce((s, m) => s + m.totalHandleCents, 0)
    expect(tixSum).toBe(recon.tickets)
    expect(handleSum).toBe(recon.handleCents)
  })

  it('a parlay rides its whole stake on each leg’s market', () => {
    const rows = toSplitBets([
      bet('p', 'c', 5_000, [
        leg({ marketId: 'm1', side: 'home' }),
        leg({ marketId: 'm2', side: 'over', marketType: 'total' }),
      ]),
    ])
    expect(splitForMarket(rows, 'm1')!.totalHandleCents).toBe(5_000)
    expect(splitForMarket(rows, 'm2')!.totalHandleCents).toBe(5_000)
  })
})

describe('most-bet markets', () => {
  const bets: BookBet[] = [
    // m1: 3 tickets, $30
    bet('a1', 'a', 1_000, [leg({ marketId: 'm1', side: 'home' })]),
    bet('a2', 'b', 1_000, [leg({ marketId: 'm1', side: 'home' })]),
    bet('a3', 'c', 1_000, [leg({ marketId: 'm1', side: 'away' })]),
    // m2: 2 tickets, $90 (heavier handle, fewer tickets)
    bet('a4', 'd', 4_500, [leg({ marketId: 'm2', side: 'over', marketType: 'total' })]),
    bet('a5', 'e', 4_500, [leg({ marketId: 'm2', side: 'under', marketType: 'total' })]),
  ]
  const rows = toSplitBets(bets)

  it('ranks by ticket count by default', () => {
    const r = mostBetMarkets(rows, { by: 'tickets' })
    expect(r.map((x) => x.split.marketId)).toEqual(['m1', 'm2']) // 3 > 2
    expect(r[0].rank).toBe(1)
    expect(r[0].lean!.side).toBe('home')
  })

  it('ranks by handle when asked', () => {
    const r = mostBetMarkets(rows, { by: 'handle' })
    expect(r.map((x) => x.split.marketId)).toEqual(['m2', 'm1']) // $90 > $30
  })

  it('honours the limit', () => {
    expect(mostBetMarkets(rows, { by: 'tickets', limit: 1 })).toHaveLength(1)
  })
})

describe('edge cases', () => {
  it('returns null for a market with no action', () => {
    expect(splitForMarket([], 'nope')).toBeNull()
    expect(marketSplits([]).size).toBe(0)
  })
})

describe('roundShares — displayed integers sum to exactly 100', () => {
  it('rounds a clean two-way split unchanged', () => {
    expect(roundShares([60, 40])).toEqual([60, 40])
  })

  it('fixes a three-way split that would otherwise read 99', () => {
    const r = roundShares([100 / 3, 100 / 3, 100 / 3])
    expect(r.reduce((a, b) => a + b, 0)).toBe(100)
    expect(r).toEqual([34, 33, 33]) // largest-remainder gives the first the spare unit
  })

  it('keeps a sum of 100 for an uneven split', () => {
    const r = roundShares([66.666, 33.333])
    expect(r.reduce((a, b) => a + b, 0)).toBe(100)
    expect(r).toEqual([67, 33])
  })

  it('handles a single side and an empty set', () => {
    expect(roundShares([100])).toEqual([100])
    expect(roundShares([])).toEqual([])
  })
})
