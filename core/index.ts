/**
 * Public surface of the shared credit/balance core (CLAUDE.md §3).
 * Games and the sportsbook import from here — never copy this logic.
 */

export type { Account, Wager, Outcome, WagerStatus } from './types.js'
export {
  availableToWager,
  maxBet,
  placeWager,
  resolveWager,
  resolveAtMultiplier,
  settleWeek,
  grant,
  onWagerResolved,
  onGrant,
} from './core.js'
export type { ResolveEvent, GrantEvent } from './core.js'
