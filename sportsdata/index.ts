/**
 * Sportsdata module public surface — the vendor-facing adapter layer that turns
 * a real odds/scores API into the sportsbook's `SportsbookFeed`. Roll-up is one
 * line where the store is created:
 *
 *   createStore(account, { feed: createHttpFeed({ fetchSlate: fetchJsonSlate(URL) }) })
 *
 * instead of `createMockFeed()`. Nothing else in the app changes.
 */

export type { ApiEvent, ApiBookmaker, ApiMarket, ApiOutcome, ApiScore } from './types.js'
export { mapEvent, mapSlate, type MapOptions } from './map.js'
export { createHttpFeed, fetchJsonSlate, type HttpFeed, type HttpFeedOptions } from './httpFeed.js'
