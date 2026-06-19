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
  MAX_MARGIN,
  decimalFromAmerican,
  americanFromDecimal,
  priceFromAmerican,
  priceFromDecimal,
  makeOverride,
  applyMargin,
  applyPricing,
  // configurable margin (operator hold posture, per-market)
  MARGIN_POSTURES,
  DEFAULT_MARGIN_CONFIG,
  resolveMargin,
  // correlated same-game parlay (SGP) pricing
  SGP_MAX_LEGS,
  MAX_SGP_DECIMAL,
  DEFAULT_SGP_CORRELATION,
  SPORT_CORRELATION,
  correlationForSport,
  impliedProbability,
  devig,
  correlatedJoint,
  priceSgp,
} from './pricing.js'
export type {
  PricingOptions,
  PricedSelection,
  SgpQuote,
  MarginConfig,
  MarginPosture,
} from './pricing.js'

// The live operator margin config — the console setting writes it, the poller reads it.
export {
  getMarginConfig,
  getMarginVersion,
  subscribeMargin,
  setMarginConfig,
  setBaseMargin,
  setMarketMargin,
  applyPosture,
  __resetMarginConfig,
} from './margin-config.js'

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
  CORE_LEAGUES,
  EXTENDED_LEAGUES,
  SCAFFOLDED_LEAGUES,
  SGO_LEAGUE_REFERENCE,
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

/* ----------------------- pricing pipeline (math half) --------------------- */
// The configurable de-vig + margin engine + its config (pricing_config). NOTE: the engine's
// `devig` and `applyMargin` are NOT re-exported here — they would shadow the legacy
// `devig(americans)` / `applyMargin(Price, margin)` above. Lane B + callers import those two
// from './devig.js' and './pricing-engine.js' directly:
//   import { devig } from '../lib/odds/devig.js'
//   import { applyMargin, priceMarket } from '../lib/odds/pricing-engine.js'  // post-margin hook = Lane B's gate
export { DEVIG_METHODS, DEFAULT_DEVIG_METHOD } from './devig.js'
export type { DevigMethod } from './devig.js'
export {
  PRICING_POSTURE_PRESETS,
  effectiveSettings,
  bookHold,
  priceMarket,
} from './pricing-engine.js'
export type {
  PricePosture,
  MarginSettings,
  PricedOdd,
  PipelineContext,
  PostMarginHook,
  PriceMarketOptions,
} from './pricing-engine.js'
export {
  DEFAULT_PRICING_ROW,
  toMarginSettings,
  applyPosturePreset,
  resolvePricingRow,
  resolvePricingConfig,
  resolveMarginSettings,
  getPricingRows,
  getPricingConfigVersion,
  subscribePricingConfig,
  upsertPricingRow,
  removePricingRow,
  setPosture,
  __resetPricingConfig,
} from './pricing-config.js'
export type { PricingConfigRow } from './pricing-config.js'
