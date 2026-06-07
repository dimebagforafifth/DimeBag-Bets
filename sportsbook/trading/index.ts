/**
 * Sportsbook trading layer — public surface (CLAUDE.md §4).
 *
 * The bookmaker's odds toolkit, layered on top of `sportsbook/odds.ts` without
 * touching it: format conversions, margin/devig analysis, price-making, and
 * book risk/exposure. Pure functions on plain numbers, so the admin/management
 * layer or the live store can adopt them incrementally during roll-up.
 *
 * Import from here:  `import { marketReport, makePrices, exposure } from 'sportsbook/trading'`
 */

export {
  probabilityFromDecimal,
  decimalFromProbability,
  americanFromProbability,
  decimalFromFractional,
  fractionalFromDecimal,
  americanFromDecimal,
  decimalFromAmerican,
} from './convert.js'

export {
  impliedFromDecimal,
  overround,
  bookMargin,
  theoreticalHold,
  devigProportional,
  devigPower,
  devigShin,
  fairProbabilities,
  fairDecimalOdds,
  overroundAmerican,
  bookMarginAmerican,
  fairProbabilitiesAmerican,
  marketReport,
} from './margin.js'
export type { DevigMethod, MarketReport } from './margin.js'

export {
  postedImpliedProbabilities,
  makePrices,
  twoWayPrices,
  pricedOverround,
} from './pricing.js'
export type { MarginMethod, PricedOutcome } from './pricing.js'

export {
  exposure,
  balancedStakeFractions,
  expectedHold,
  suggestLineMove,
} from './book.js'
export type { BookPosition, OutcomeExposure, ExposureReport, LineMoveSuggestion } from './book.js'

export {
  expectedValue,
  edge,
  isValueBet,
  breakEvenProbability,
  kellyFraction,
  kellyStake,
  closingLineValue,
} from './value.js'

export { arbitrage, marketSafety } from './arbitrage.js'
export type { ArbitrageResult, MarketSafety } from './arbitrage.js'

export { hedgeToLock, evaluateHedge, maxBookStake } from './hedge.js'
export type { HedgeResult, HedgeOutcomes } from './hedge.js'
