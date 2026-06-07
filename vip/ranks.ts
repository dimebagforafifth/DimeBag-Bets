/**
 * The default VIP rank ladder. Thresholds and rewards are integer CENTS, and the
 * thresholds are LIFETIME WAGERED (cumulative stake across every settled wager).
 *
 * Ordered none → diamond; thresholds are strictly non-decreasing along the ladder
 * so `rankFor` can pick the highest rung reached and `rankProgress` can measure
 * toward the next one.
 */

import type { RankDef, RankId } from './types.js'

/** Canonical ladder order, lowest → highest. */
export const RANK_ORDER: RankId[] = ['none', 'bronze', 'silver', 'gold', 'platinum', 'diamond']

/**
 * A fresh copy of the default ladder. Returns a new array of new objects each
 * call so a caller can mutate config (re-price thresholds/rewards) without
 * touching the shared default.
 */
export function defaultRanks(): RankDef[] {
  return [
    { id: 'none', name: 'None', color: '#6b7a89', minWagered: 0, freePlayReward: 0, perks: [] },
    {
      id: 'bronze',
      name: 'Bronze',
      color: '#c08457',
      minWagered: 100_000, // $1,000 wagered
      freePlayReward: 500, // → $5 free play
      perks: ['Bronze badge'],
    },
    {
      id: 'silver',
      name: 'Silver',
      color: '#b9c4cf',
      minWagered: 1_000_000, // $10,000 wagered
      freePlayReward: 2_000, // → $20 free play
      perks: ['Silver badge', 'Weekly free play'],
    },
    {
      id: 'gold',
      name: 'Gold',
      color: '#e8b84b',
      minWagered: 5_000_000, // $50,000 wagered
      freePlayReward: 7_500, // → $75 free play
      perks: ['Gold badge', 'Priority support'],
    },
    {
      id: 'platinum',
      name: 'Platinum',
      color: '#7fd3e0',
      minWagered: 25_000_000, // $250,000 wagered
      freePlayReward: 30_000, // → $300 free play
      perks: ['Platinum badge', 'Higher limits'],
    },
    {
      id: 'diamond',
      name: 'Diamond',
      color: '#b58bff',
      minWagered: 100_000_000, // $1,000,000 wagered
      freePlayReward: 150_000, // → $1,500 free play
      perks: ['Diamond badge', 'Dedicated host'],
    },
  ]
}
