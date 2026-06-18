/**
 * Metric aggregations are pure over a player's settled bet rows. Proves each metric computes
 * correctly, win-streak ignores pushes and respects order, biggest-multiplier counts wins
 * only, and parlay-hits counts winning multi-leg tickets.
 */
import { describe, it, expect } from 'vitest'
import type { BetRow } from '../app/ledger-stats.js'
import type { BookBet } from '../app/book/bets-store.js'
import type { Outcome } from '../core/index.js'
import {
  totalWagered,
  netProfit,
  biggestMultiplier,
  longestWinStreak,
  wonParlays,
  metricValueFrom,
  formatMetricValue,
} from './metrics.js'

let seq = 0
function row(p: {
  stake: number
  profit: number
  multiplier: number
  outcome: Outcome
  time?: number
}): BetRow {
  return {
    id: ++seq,
    accountId: 'p1',
    gameKey: 'mines',
    game: 'Mines',
    stake: p.stake,
    multiplier: p.multiplier,
    profit: p.profit,
    outcome: p.outcome,
    time: p.time ?? seq,
  }
}
const parlay = (status: BookBet['status'], mode: BookBet['mode'] = 'parlay'): BookBet =>
  ({ mode, status }) as BookBet

describe('totalWagered / netProfit', () => {
  it('sum stake and signed profit over the rows (cents)', () => {
    const rows = [
      row({ stake: 1_000, profit: 2_000, multiplier: 3, outcome: 'win' }),
      row({ stake: 500, profit: -500, multiplier: 0, outcome: 'loss' }),
      row({ stake: 2_000, profit: 0, multiplier: 1, outcome: 'push' }),
    ]
    expect(totalWagered(rows)).toBe(3_500)
    expect(netProfit(rows)).toBe(1_500)
  })
})

describe('biggestMultiplier', () => {
  it('takes the largest WINNING multiplier, 0 when there are no wins', () => {
    const rows = [
      row({ stake: 100, profit: 400, multiplier: 5, outcome: 'win' }),
      row({ stake: 100, profit: 1_150, multiplier: 12.5, outcome: 'win' }),
      row({ stake: 100, profit: -100, multiplier: 0, outcome: 'loss' }),
    ]
    expect(biggestMultiplier(rows)).toBe(12.5)
    expect(
      biggestMultiplier([row({ stake: 100, profit: -100, multiplier: 0, outcome: 'loss' })]),
    ).toBe(0)
  })
})

describe('longestWinStreak', () => {
  it('longest run of consecutive wins; a loss breaks it, a push is neutral; order-independent', () => {
    // chronological: W W L W W (push) W  →  decided = W W L W W W → longest run = 3
    const rows = [
      row({ stake: 1, profit: 1, multiplier: 2, outcome: 'win', time: 1 }),
      row({ stake: 1, profit: 1, multiplier: 2, outcome: 'win', time: 2 }),
      row({ stake: 1, profit: -1, multiplier: 0, outcome: 'loss', time: 3 }),
      row({ stake: 1, profit: 1, multiplier: 2, outcome: 'win', time: 4 }),
      row({ stake: 1, profit: 1, multiplier: 2, outcome: 'win', time: 5 }),
      row({ stake: 1, profit: 0, multiplier: 1, outcome: 'push', time: 6 }),
      row({ stake: 1, profit: 1, multiplier: 2, outcome: 'win', time: 7 }),
    ]
    // shuffle the input — the function sorts by time
    expect(longestWinStreak([...rows].reverse())).toBe(3)
    expect(longestWinStreak([])).toBe(0)
  })
})

describe('wonParlays', () => {
  it('counts only winning multi-leg tickets', () => {
    const bets = [parlay('won'), parlay('won'), parlay('lost'), parlay('won', 'single')]
    expect(wonParlays(bets)).toBe(2) // two won parlays; the single + the lost parlay excluded
  })
})

describe('metricValueFrom + formatMetricValue', () => {
  it('dispatches each metric and renders metric-native units', () => {
    const rows = [
      row({ stake: 1_000, profit: 2_000, multiplier: 3, outcome: 'win' }),
      row({ stake: 1_000, profit: -1_000, multiplier: 0, outcome: 'loss' }),
    ]
    expect(metricValueFrom('wagered', rows, [])).toBe(2_000)
    expect(metricValueFrom('net_profit', rows, [])).toBe(1_000)
    expect(metricValueFrom('biggest_multiplier', rows, [])).toBe(3)
    expect(metricValueFrom('win_streak', rows, [])).toBe(1)
    expect(metricValueFrom('parlay_hits', rows, [parlay('won')])).toBe(1)

    expect(formatMetricValue('wagered', 2_000)).toMatch(/20/) // $20.00
    expect(formatMetricValue('biggest_multiplier', 3)).toBe('3.00×')
    expect(formatMetricValue('win_streak', 4)).toBe('4')
  })
})
