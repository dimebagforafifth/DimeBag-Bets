/**
 * Futures / outrights (CLAUDE.md §4) — long-horizon book markets.
 *
 * A futures market is a single market with MANY outcomes (e.g. "NBA Champion") —
 * you back one to win, and it settles when the event resolves. Books carry a
 * fat margin on these (overrounds well above 1), which is why the implied
 * probabilities can sum to 1.3+.
 *
 * Pure data + pricing + grading. A pick settles through `core` like any single
 * bet: `win` (at the outcome's decimal) if it's the winner, `loss` otherwise,
 * `void` until the market settles.
 */

import { decimalFromAmerican } from '../odds.js'

export type FutureStatus = 'open' | 'settled'

export interface FutureOutcome {
  id: string
  label: string
  /** American price for this outcome to win the market. */
  american: number
}

export interface FutureMarket {
  id: string
  name: string
  league: string
  status: FutureStatus
  outcomes: FutureOutcome[]
  /** Set once `status === 'settled'`: the winning outcome id. */
  winnerId?: string
}

/** A small sample futures slate (prices illustrative). */
export const FUTURES: FutureMarket[] = [
  {
    id: 'nba-champ-2026',
    name: 'NBA Championship 2026',
    league: 'NBA',
    status: 'open',
    outcomes: [
      { id: 'bos', label: 'Boston Celtics', american: 350 },
      { id: 'okc', label: 'Oklahoma City Thunder', american: 400 },
      { id: 'den', label: 'Denver Nuggets', american: 550 },
      { id: 'nyk', label: 'New York Knicks', american: 700 },
      { id: 'dal', label: 'Dallas Mavericks', american: 1000 },
      { id: 'min', label: 'Minnesota Timberwolves', american: 1400 },
      { id: 'field', label: 'Field (any other)', american: 150 },
    ],
  },
  {
    id: 'nfl-sb-2026',
    name: 'Super Bowl LX Winner',
    league: 'NFL',
    status: 'open',
    outcomes: [
      { id: 'sf', label: 'San Francisco 49ers', american: 450 },
      { id: 'kc', label: 'Kansas City Chiefs', american: 500 },
      { id: 'bal', label: 'Baltimore Ravens', american: 650 },
      { id: 'phi', label: 'Philadelphia Eagles', american: 700 },
      { id: 'buf', label: 'Buffalo Bills', american: 800 },
      { id: 'field', label: 'Field (any other)', american: 120 },
    ],
  },
]

/** The decimal price for a futures outcome. */
export function futureDecimal(outcome: FutureOutcome): number {
  return decimalFromAmerican(outcome.american)
}

/** Look up an outcome within a market. */
export function findFutureOutcome(market: FutureMarket, outcomeId: string): FutureOutcome | undefined {
  return market.outcomes.find((o) => o.id === outcomeId)
}

/**
 * The market's overround: Σ implied probability across every outcome. Futures
 * routinely run 1.2–1.5 (a 20–50% book) because of the long horizon and field
 * uncertainty.
 */
export function futureOverround(market: FutureMarket): number {
  return market.outcomes.reduce((s, o) => s + 1 / decimalFromAmerican(o.american), 0)
}

/**
 * Grade a futures pick. `void` until the market settles (stake returned); then
 * `win` if the pick is the winner, else `loss`.
 */
export function gradeFuture(market: FutureMarket, pickId: string): 'win' | 'loss' | 'void' {
  if (!findFutureOutcome(market, pickId)) throw new Error(`unknown outcome ${pickId} in ${market.id}`)
  if (market.status !== 'settled' || !market.winnerId) return 'void'
  return market.winnerId === pickId ? 'win' : 'loss'
}

/** The payout multiplier a graded futures pick settles at via `core`. */
export function futurePayoutMultiplier(market: FutureMarket, pickId: string): number {
  const outcome = findFutureOutcome(market, pickId)
  if (!outcome) throw new Error(`unknown outcome ${pickId} in ${market.id}`)
  const grade = gradeFuture(market, pickId)
  return grade === 'win' ? futureDecimal(outcome) : grade === 'void' ? 1 : 0
}
