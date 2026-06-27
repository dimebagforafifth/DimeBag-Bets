/**
 * Sportsbook module public surface (CLAUDE.md §4, §5). The app shell and any
 * caller import from here. Separate from the casino `games/` — its own section,
 * sharing only the one `core` balance.
 */

/** Self-declared identity for the section nav. */
export const sportsbookMeta = {
  key: 'sportsbook',
  name: 'Sportsbook',
  tagline: 'Moneyline, spreads, totals & parlays — one balance.',
  accent: '#f0be4a',
} as const

export {
  MAX_PARLAY_DECIMAL,
  decimalFromAmerican,
  americanFromDecimal,
  impliedProbability,
  formatAmerican,
  parlayDecimal,
  potentialReturn,
} from './odds.js'

export { EVENTS, LEAGUES, SPORTS, leaguesInSport, findEvent, gradeSelection } from './markets.js'
export type { MarketKind, Pick, Selection, MatchResult, GameEvent, EventStatus } from './markets.js'

export {
  priceTicket,
  hasRelatedLegs,
  placeTicket,
  gradeTicket,
  cashOutValue,
  cashOutTicket,
  CASHOUT_MARGIN,
} from './engine.js'
export type { TicketKind, TicketStatus, Ticket, PlaceTicketOptions } from './engine.js'

export { liveWinProb, liveSelections, liveAmerican, liveDecimal, LIVE_MARGIN } from './live.js'

export type { SportsbookFeed, FeedStatus, FeedHealth } from './provider.js'
export { createMockFeed, stateAt } from './mockFeed.js'
export { createStore } from './store.js'
export type { SportsbookStore, SportsbookState, CreateStoreOptions } from './store.js'

// The book overlay — the operator's line management (suspend / move line / set
// vig) applied over the feed before players bet it. The trading desk edits it;
// every player store reads it (see book/overlay.ts).
export {
  applyOverlay,
  subscribeOverlay,
  getOverlayVersion,
  getAdjustment,
  isEventSuspended,
  isLeagueSuspended,
  isMarketSuspended,
  isMarketAdjusted,
  hasOverride,
  setMarketSuspended,
  setEventSuspended,
  setLeagueSuspended,
  nudgeLine,
  setMargin,
  setShade,
  setLineOverride,
  clearLineOverride,
  resetMarket,
  resetOverlay,
} from './book/overlay.js'
export type { MarketAdjustment } from './book/overlay.js'

// The pricing pipeline + house margin + audit (Part 2) — re-exported for the desk UI.
export {
  publishMarket,
  effectiveMargin,
  getHouseMargin,
  setHouseMargin,
  getLeagueMarketMargin,
  setLeagueMarketMargin,
  subscribeHouseMargin,
  getHouseMarginVersion,
  houseMarginActive,
  resetHouseMargin,
  recordPricingAudit,
  getPricingAudit,
  subscribePricingAudit,
  getPricingAuditVersion,
  setPricingActor,
  altLineLadderSpread,
} from './trading/index.js'
export type {
  PublishSource,
  PublishLayers,
  PublishedMarket,
  LineOverride,
  PricingAuditEntry,
} from './trading/index.js'

// The futures book — outright markets placed/graded through core, settled by the
// operator (or a real feed later). See book/futures.ts.
export {
  getFutures,
  getFutureMarket,
  settleFuture,
  resetFutures,
  subscribeFutures,
  getFuturesVersion,
  placeFutureTicket,
  gradeFutureTicket,
} from './book/futures.js'
export type { FutureTicket, FutureTicketStatus } from './book/futures.js'
export { FUTURES, futureDecimal, futureOverround, findFutureOutcome } from './bets/futures.js'
export type { FutureMarket, FutureOutcome, FutureStatus } from './bets/futures.js'

// The results overlay — the operator's manual grading (enter/correct a final
// result, or void a postponed/abandoned fixture). Settles every player's open
// tickets through core, exactly like the feed finaling a game. See book/results.ts.
export {
  setResult,
  voidEvent,
  clearResult,
  resetResults,
  getResult,
  isResultOverridden,
  subscribeResults,
  getResultsVersion,
  applyResults,
} from './book/results.js'
export type { ResultOverride } from './book/results.js'

// Additional bet types (round robins, teasers, futures, boosts) layered on top
// of the core ticket flow. The player slip uses the round-robin combinatorics to
// expand a set of picks into its constituent parlays; all of it settles through
// the same `core` figure (see ./bets).
export { combinations, roundRobinParlayCount } from './bets/index.js'
