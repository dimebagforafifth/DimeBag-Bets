import { describe, it, expect } from 'vitest'
import {
  inRange,
  bookActivity,
  perGameHold,
  perPlayerActivity,
  engagement,
  toCSV,
  type AnalyticsRecord,
} from './analytics.js'

const DAY = 86_400_000
const NOW = 100 * DAY

let seq = 0
function rec(o: Partial<AnalyticsRecord>): AnalyticsRecord {
  return {
    seq: ++seq,
    time: NOW,
    accountId: 'A',
    gameKey: 'mines',
    game: 'Mines',
    kind: 'wager',
    stake: 0,
    profit: 0,
    multiplier: 0,
    outcome: 'loss',
    ...o,
  }
}

/** Money dataset: A loses 1000 then wins 500 (mines), B loses 2000 (dice) + gets a
 *  500 bonus, C pushes 500 (mines). */
function moneySet(): AnalyticsRecord[] {
  return [
    rec({ accountId: 'A', gameKey: 'mines', game: 'Mines', stake: 1000, profit: -1000, time: NOW - DAY }),
    rec({ accountId: 'A', gameKey: 'mines', game: 'Mines', stake: 1000, profit: 500, multiplier: 1.5, outcome: 'win', time: NOW - 2 * DAY }),
    rec({ accountId: 'B', gameKey: 'dice', game: 'Dice', stake: 2000, profit: -2000, time: NOW - 3 * DAY }),
    rec({ accountId: 'B', gameKey: 'bonus', game: 'Bonus', kind: 'bonus', stake: 0, profit: 500, multiplier: 1, outcome: 'win', time: NOW - DAY }),
    rec({ accountId: 'C', gameKey: 'mines', game: 'Mines', stake: 500, profit: 0, multiplier: 1, outcome: 'push', time: NOW - 40 * DAY }),
  ]
}

describe('inRange (half-open)', () => {
  it('keeps [from, to)', () => {
    const rs = [rec({ time: 10 }), rec({ time: 20 }), rec({ time: 30 })]
    expect(inRange(rs, 10, 30).map((r) => r.time)).toEqual([10, 20]) // 30 excluded
  })
})

describe('bookActivity', () => {
  it('rolls turnover, GGR, hold, players, bonus cost, house net', () => {
    const a = bookActivity(moneySet())
    expect(a.bets).toBe(4) // 4 wagers (bonus excluded)
    expect(a.turnover).toBe(4500) // 1000+1000+2000+500
    expect(a.players).toBe(3) // A, B, C
    expect(a.playerNet).toBe(-2500) // -1000+500-2000+0
    expect(a.houseGGR).toBe(2500) // house wins what players lose
    expect(a.holdPct).toBeCloseTo(2500 / 4500, 10)
    expect(a.bonusCost).toBe(500)
    expect(a.houseNet).toBe(2000) // GGR 2500 − bonus 500
  })
  it('is safe on an empty feed', () => {
    expect(bookActivity([])).toMatchObject({ bets: 0, turnover: 0, holdPct: 0, houseNet: 0 })
  })
})

describe('perGameHold', () => {
  it('aggregates per game, sorted by turnover, with hold%', () => {
    const g = perGameHold(moneySet())
    expect(g.map((x) => x.gameKey)).toEqual(['mines', 'dice']) // mines 2500 > dice 2000
    const mines = g[0]
    expect(mines).toMatchObject({ bets: 3, turnover: 2500, houseGGR: 500, players: 2 })
    expect(mines.holdPct).toBeCloseTo(0.2, 10) // 500/2500
    const dice = g[1]
    expect(dice).toMatchObject({ bets: 1, turnover: 2000, houseGGR: 2000 })
    expect(dice.holdPct).toBeCloseTo(1, 10)
  })
  it('excludes bonuses from game hold', () => {
    expect(perGameHold(moneySet()).some((g) => g.gameKey === 'bonus')).toBe(false)
  })
})

describe('perPlayerActivity', () => {
  it('aggregates per player with first/last active + bonus', () => {
    const p = perPlayerActivity(moneySet())
    const byId = Object.fromEntries(p.map((x) => [x.accountId, x]))
    expect(byId.A).toMatchObject({ bets: 2, turnover: 2000, net: -500, bonus: 0 })
    expect(byId.A.firstActive).toBe(NOW - 2 * DAY)
    expect(byId.A.lastActive).toBe(NOW - DAY)
    expect(byId.B).toMatchObject({ bets: 1, turnover: 2000, net: -2000, bonus: 500 })
    expect(byId.B.lastActive).toBe(NOW - DAY) // the bonus updated lastActive
    expect(byId.C).toMatchObject({ bets: 1, turnover: 500, net: 0 })
  })
})

describe('engagement (window over window)', () => {
  // A,B active this week (both brand new); E active this week AND last week (returning,
  // retained); D active only last week (churned); C active 40 days ago (dormant).
  function engSet(): AnalyticsRecord[] {
    return [
      rec({ accountId: 'A', stake: 100, profit: -100, time: NOW - DAY }),
      rec({ accountId: 'A', stake: 100, profit: -100, time: NOW - 2 * DAY }),
      rec({ accountId: 'B', stake: 100, profit: -100, time: NOW - 3 * DAY }),
      rec({ accountId: 'C', stake: 100, profit: -100, time: NOW - 40 * DAY }),
      rec({ accountId: 'D', stake: 100, profit: -100, time: NOW - 10 * DAY }),
      rec({ accountId: 'E', stake: 100, profit: -100, time: NOW - 10 * DAY }),
      rec({ accountId: 'E', stake: 100, profit: -100, time: NOW - 2 * DAY }),
    ]
  }
  it('classifies active / new / returning / dormant / churned + retention', () => {
    const e = engagement(engSet(), NOW, 7)
    expect(e.active).toBe(3) // A, B, E
    expect(e.newPlayers).toBe(2) // A, B (first seen inside the window)
    expect(e.returning).toBe(1) // E (active now, but seen before the window)
    expect(e.dormant).toBe(2) // C, D (ever active, not this window)
    expect(e.churned).toBe(1) // D (last week, gone this week)
    expect(e.retentionPct).toBeCloseTo(0.5, 10) // of {D,E} last week, E retained
  })
  it('ignores bonuses for engagement', () => {
    const rs = [rec({ accountId: 'Z', kind: 'bonus', stake: 0, profit: 500, time: NOW - DAY })]
    expect(engagement(rs, NOW, 7).active).toBe(0) // a bonus is not "activity"
  })
})

describe('toCSV', () => {
  it('emits a header + escaped rows', () => {
    const csv = toCSV([{ game: 'Mines', turnover: 2500 }, { game: 'a,b', turnover: 10 }])
    expect(csv).toBe('game,turnover\nMines,2500\n"a,b",10')
  })
  it('is empty for no rows', () => {
    expect(toCSV([])).toBe('')
  })
})
