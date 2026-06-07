/**
 * Additional bet types — public surface (CLAUDE.md §4).
 *
 * Real-book wagers layered on top of the core sportsbook without touching it:
 * round robins, teasers, and futures/outrights. Pure pricing/grading/combinatorics
 * that settle through `core`, so the store and UI can adopt them during roll-up.
 *
 * Import from here:  `import { roundRobin, gradeTeaser, gradeFuture } from 'sportsbook/bets'`
 */

export { combinations, parlayDecimalOf, roundRobin, roundRobinParlayCount } from './roundrobin.js'
export type { RoundRobinLeg, RoundRobinParlay, RoundRobinTicket } from './roundrobin.js'

export {
  TEASER_TABLES,
  findTeaserTable,
  teaserDecimal,
  teaseLine,
  gradeTeaserLeg,
  gradeTeaser,
} from './teasers.js'
export type {
  TeaserSport,
  TeaserMarket,
  TeaserPick,
  LegGrade,
  TeaserTable,
  TeaserLeg,
  TeaserResult,
  TeaserGrade,
} from './teasers.js'

export {
  FUTURES,
  futureDecimal,
  findFutureOutcome,
  futureOverround,
  gradeFuture,
  futurePayoutMultiplier,
} from './futures.js'
export type { FutureStatus, FutureOutcome, FutureMarket } from './futures.js'

export {
  emptySlip,
  addSelection,
  removeSelection,
  toggleSelection,
  relatedPairs,
  canCombine,
  teaserEligible,
  availableBetTypes,
  priceSingles,
  priceParlay,
  priceRoundRobin,
  priceTeaser,
} from './slip.js'
export type {
  SlipMarket,
  SlipPick,
  SlipSelection,
  BetType,
  BetSlip,
  SingleTicket,
  SinglesPricing,
  ParlayPricing,
  TeaserPricing,
} from './slip.js'

export {
  boostProfit,
  boostPercentFor,
  boostedReturn,
  freeBetReturn,
  freeBetValue,
  freeBetMultiplier,
} from './boosts.js'
