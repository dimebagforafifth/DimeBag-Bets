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
  createOddsApiSlate,
} from './theOddsApi.js'
export type { OddsApiConfig, OddsApiScoreEvent, Quota, FetchLike, OddsApiClientOptions } from './theOddsApi.js'

export { isLiveApi, isUpcomingApi, filterSlate, combineFeeds } from './feedTools.js'

export { etagFetch, cachedSlate, createQuotaTracker } from './cache.js'
export type { RawFetch, CacheOptions, QuotaTracker } from './cache.js'
