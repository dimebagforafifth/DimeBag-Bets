/**
 * Public surface of the SGO odds DATA/FEED lane. The UI lane + the wiring pass import from
 * here. Contract types are the stable seam; providers + poller + pricing are the producers.
 */

export type {
  Price,
  EventStatus,
  MarketType,
  Period,
  Selection,
  NormalizedMarket,
  NormalizedEvent,
  ListEventsOptions,
  OddsFeedProvider,
  OddsEventRow,
  OddsMarketRow,
  OddsSelectionRow,
} from './contract.js'

export {
  DEFAULT_MARGIN,
  decimalFromAmerican,
  americanFromDecimal,
  priceFromAmerican,
  priceFromDecimal,
  makeOverride,
  applyMargin,
  applyPricing,
} from './pricing.js'
export type { PricingOptions, PricedSelection } from './pricing.js'

export {
  SGOProvider,
  normalizeEvent,
  parseOddId,
  marketTypeOf,
  statusOf,
} from './providers/SGOProvider.js'
export type { SGOProviderConfig, ParsedOddId } from './providers/SGOProvider.js'
export { MockProvider, MOCK_EVENTS } from './providers/MockProvider.js'
export { TheOddsAPIProvider } from './providers/TheOddsAPIProvider.js'
export type { TheOddsAPIConfig } from './providers/TheOddsAPIProvider.js'

export {
  Poller,
  buildRows,
  selectProvider,
  createSupabaseOddsCache,
  ACTIVE_LEAGUES,
  SCAFFOLDED_LEAGUES,
} from './poller.js'
export type { OddsCache, PollerConfig, PollResult, SupabaseLike } from './poller.js'

// Scheduled polling — keep a deployed cache fresh (a cron / route / loop triggers
// runPollCycle; mock stays default, live only on SGO_LIVE=1). See api/poll-odds.ts.
export {
  runPollCycle,
  schedulePolling,
  pollIntervalSeconds,
  isLiveMode,
  DEFAULT_POLL_INTERVAL_SECONDS,
  MIN_POLL_INTERVAL_SECONDS,
} from './schedule.js'
export type { PollCycleResult, RunPollCycleOptions, Scheduler } from './schedule.js'
export { createRestOddsCache } from './rest-cache.js'
