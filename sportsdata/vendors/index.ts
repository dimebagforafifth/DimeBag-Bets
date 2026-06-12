/**
 * Vendor adapters & feed composition — public surface (CLAUDE.md §4, §6).
 *
 * The "attach a real odds API" layer, built on top of `sportsdata/httpFeed`
 * without touching it. Pull pre-match odds and live scores from the vendor,
 * merge them, and (optionally) split into fast live + slow pre-match feeds:
 *
 *   import { createOddsApiSlate, filterSlate, isLiveApi, combineFeeds } from 'sportsdata/vendors'
 *   import { createHttpFeed } from 'sportsdata'
 *
 *   const slate = createOddsApiSlate({ config: { apiKey, sportKeys: ['basketball_nba'] } })
 *   const feed  = createHttpFeed({ fetchSlate: slate, intervalMs: 8000 })
 *   // → createStore(account, { feed })
 */

export {
  oddsUrl,
  scoresUrl,
  mergeScores,
  readQuota,
  createOddsApiSlate,
} from './theOddsApi.js'
export type { OddsApiConfig, OddsApiScoreEvent, Quota, FetchLike, OddsApiClientOptions } from './theOddsApi.js'

export { isLiveApi, isUpcomingApi, filterSlate, combineFeeds } from './feedTools.js'

export { etagFetch, cachedSlate, createQuotaTracker } from './cache.js'
export type { RawFetch, CacheOptions, QuotaTracker } from './cache.js'

// ── The vendor-agnostic provider layer (the formal OddsFeedProvider) ──────────
export { makeProvider } from './provider.js'
export type { OddsFeedProvider, ProviderParts, ApiScoreEvent } from './provider.js'
export { createTheOddsApiProvider } from './theOddsApiProvider.js'
export type { TheOddsApiProviderOptions } from './theOddsApiProvider.js'
export {
  createSportsGameOddsProvider,
  mapSgoEvent,
  eventsUrl as sgoEventsUrl,
} from './sportsGameOdds.js'
export type {
  SportsGameOddsConfig,
  SportsGameOddsProviderOptions,
  SgoEvent,
  SgoMarket,
  SgoOutcome,
  SgoTeam,
} from './sportsGameOdds.js'
export { createMockProvider, MOCK_SLATE } from './mock.js'
export type { MockProviderOptions } from './mock.js'
export { createOddsPapiProvider } from './oddsPapi.js'
export type { OddsPapiConfig, OddsPapiProviderOptions } from './oddsPapi.js'
export { withBackoff } from './backoff.js'
export type { Backoff, BackoffOptions } from './backoff.js'
export { createUsageLog } from './usage.js'
export type { UsageLog, UsageEntry } from './usage.js'
