/**
 * Pure derivation tests — units, the cumulative-P&L curve, and splits. The curve must reconcile
 * to the net (its last point equals Σ profit), units must be stake-size-independent, and splits
 * must group + rank deterministically. No stores, no money.
 */

import { describe, expect, it } from 'vitest'
import type { BetRow } from '../app/ledger-stats.js'
import type { BookBet } from '../app/book/bets-store.js'
import type { SlipLeg } from '../app/book/slip.js'
import { gameSplits, marketSplits, pnlFromRows, sportSplits, unitsFromRows } from './derive.js'

function row(o: Partial<BetRow> & { id: number }): BetRow {
  return {
    accountId: 'p1',
    gameKey: 'sportsbook',
    game: 'Bet',
    stake: 1000,
    multiplier: 2,
    profit: 0,
    outcome: 'win',
    time: o.id,
    ...o,
  }
}

const leg = (sport: string, marketType: SlipLeg['marketType']): SlipLeg => ({
  key: 'k',
  eventId: 'e',
  eventLabel: 'A @ B',
  leagueId: 'l',
  marketId: 'm',
  marketType,
  marketPeriod: 'game',
  side: 'home',
  pick: 'Home',
  price: { american: -110, decimal: 1.91 },
  sport,
})

function bet(o: Partial<BookBet> & { id: string }): BookBet {
  return {
    accountId: 'p1',
    playerName: 'P',
    placedBy: 'P',
    mode: 'single',
    legs: [leg('BASKETBALL', 'moneyline')],
    stakeCents: 1000,
    decimal: 2,
    status: 'won',
    placedAt: 0,
    returnCents: 2000,
    ...o,
  }
}

describe('unitsFromRows', () => {
  it('sums profit/stake over decided bets, ignoring stake size, push and void', () => {
    const rows = [
      row({ id: 1, stake: 1000, profit: 1000, outcome: 'win' }), // +1.0u (even-money win)
      row({ id: 2, stake: 5000, profit: 5000, outcome: 'win' }), // +1.0u (same unit value, 5x stake)
      row({ id: 3, stake: 2000, profit: -2000, outcome: 'loss' }), // −1.0u
      row({ id: 4, stake: 9999, profit: 0, outcome: 'push' }), // no action
      row({ id: 5, stake: 9999, profit: 0, outcome: 'void' }), // no action
    ]
    expect(unitsFromRows(rows)).toBeCloseTo(1, 9)
  })
  it('skips zero-stake rows (no unit can form)', () => {
    expect(unitsFromRows([row({ id: 1, stake: 0, profit: 0, outcome: 'win' })])).toBe(0)
  })
})

describe('pnlFromRows', () => {
  it('is a running net in time order whose last point equals Σ profit (reconciles to net)', () => {
    const rows = [
      row({ id: 3, time: 30, profit: -500, outcome: 'loss' }),
      row({ id: 1, time: 10, profit: 1000, outcome: 'win' }),
      row({ id: 2, time: 20, profit: 0, outcome: 'push' }),
    ]
    const series = pnlFromRows(rows)
    expect(series.map((p) => p.time)).toEqual([10, 20, 30]) // oldest → newest
    expect(series.map((p) => p.cumulative)).toEqual([1000, 1000, 500])
    const net = rows.reduce((s, r) => s + r.profit, 0)
    expect(series[series.length - 1].cumulative).toBe(net)
  })
  it('returns an empty series for no rows', () => {
    expect(pnlFromRows([])).toEqual([])
  })
})

describe('gameSplits', () => {
  it('groups by game with roi + winRate, most-wagered first', () => {
    const rows = [
      row({ id: 1, gameKey: 'mines', game: 'Mines', stake: 1000, profit: 500, outcome: 'win' }),
      row({ id: 2, gameKey: 'mines', game: 'Mines', stake: 1000, profit: -1000, outcome: 'loss' }),
      row({ id: 3, gameKey: 'crash', game: 'Crash', stake: 5000, profit: 5000, outcome: 'win' }),
    ]
    const splits = gameSplits(rows)
    expect(splits[0].key).toBe('crash') // most wagered first
    const mines = splits.find((s) => s.key === 'mines')!
    expect(mines.bets).toBe(2)
    expect(mines.net).toBe(-500)
    expect(mines.winRate).toBe(50)
  })
})

describe('sport / market splits over settled bets', () => {
  it('groups single-sport bets by sport and single legs by market; net = return − stake', () => {
    const bets = [
      bet({
        id: 'b1',
        legs: [leg('BASKETBALL', 'moneyline')],
        stakeCents: 1000,
        returnCents: 2500,
        status: 'won',
      }),
      bet({
        id: 'b2',
        legs: [leg('FOOTBALL', 'spread')],
        stakeCents: 1000,
        returnCents: 0,
        status: 'lost',
      }),
    ]
    const sports = sportSplits(bets)
    const bball = sports.find((s) => s.key === 'BASKETBALL')!
    expect(bball.label).toBe('Basketball')
    expect(bball.net).toBe(1500) // 2500 − 1000
    const markets = marketSplits(bets)
    expect(markets.map((m) => m.key).sort()).toEqual(['moneyline', 'spread'])
  })
  it('buckets a multi-leg parlay under PARLAY/parlay, not a single sport', () => {
    const parlay = bet({
      id: 'p',
      mode: 'parlay',
      legs: [leg('BASKETBALL', 'moneyline'), leg('FOOTBALL', 'spread')],
      stakeCents: 1000,
      returnCents: 4000,
      status: 'won',
    })
    expect(sportSplits([parlay])[0].key).toBe('PARLAY')
    expect(marketSplits([parlay])[0].key).toBe('parlay')
  })
})
