/**
 * The SHARED ODDS CONTRACT (SGO odds layer).
 *
 * This is the single seam both lanes build to. The DATA/FEED lane (this lane) owns
 * this file and produces `NormalizedEvent`s into Supabase; the UI lane imports these
 * types READ-ONLY and renders them. Keep the core shapes — `NormalizedEvent`,
 * `NormalizedMarket`, `Selection`, `OddsFeedProvider` — stable; downstream code and
 * the three Supabase cache tables (odds_events / odds_markets / odds_selections) all
 * mirror them.
 *
 * Money note: this layer carries ODDS ONLY (American/decimal prices). It never holds a
 * stake or a figure — the credit/balance system stays in `core`. No cash, no points.
 */

/** A price in both notations. `american` is the signed US price (e.g. -110, +145);
 *  `decimal` is the total return multiplier (e.g. 1.91, 2.45). Always carry both so the
 *  UI never has to convert and grading stays exact. */
export interface Price {
  american: number
  decimal: number
}

/** Where an event is in its lifecycle. Betting is open while `pre` (and `live` for
 *  in-play); `ended` events are settled, not bettable. Derived from SGO's status flags. */
export type EventStatus = 'pre' | 'live' | 'ended'

/** The four market families we normalize SGO's many betTypeIDs into. */
export type MarketType = 'moneyline' | 'spread' | 'total' | 'prop'

/**
 * The scoring period a market applies to. `game` is the full event; the rest are SGO
 * periodIDs (halves, quarters, innings, etc.). Left as a widened string union so a new
 * SGO period never breaks the type — the provider passes SGO's periodID through.
 */
export type Period = 'game' | '1h' | '2h' | '1q' | '2q' | '3q' | '4q' | (string & {})

/** One bettable price on a market (one side, at one line). */
export interface Selection {
  /** Stable id, derived from the SGO oddID (+ line for alt lines). */
  selectionId: string
  /** Which side: 'home' | 'away' | 'over' | 'under', or a prop side (e.g. 'over'). */
  side: string
  /** Spread handicap or total line. Undefined for moneyline. */
  line?: number
  /** Raw feed price, straight from the bookmaker (before any house treatment). */
  priceRaw: Price
  /** Price after the house margin/override pipeline — what the UI shows and a bet locks. */
  priceDisplay: Price
  /** The bookmaker this price is sourced from (SGO bookmakerID, e.g. 'draftkings'). */
  bookmaker: string
  /** False when the book has pulled this price (suspended / not currently offered). */
  available: boolean
}

/** A market on an event: a family of opposing selections for one period (+ stat/player). */
export interface NormalizedMarket {
  /** Stable id: `${eventId}:${type}:${period}` (+ `:${statId}:${playerId}` for props). */
  marketId: string
  type: MarketType
  period: Period
  /** SGO statID the market is on (e.g. 'points', 'passing_yards'). Present for props. */
  statId?: string
  /** SGO playerID for a player prop. Absent for team markets. */
  playerId?: string
  selections: Selection[]
}

/** A normalized event with all its markets — the unit the cache stores and the UI reads. */
export interface NormalizedEvent {
  /** SGO eventID. */
  eventId: string
  /** SGO leagueID, e.g. 'NFL', 'NBA', 'EPL', 'UFC'. */
  leagueId: string
  /** SGO sportID, e.g. 'FOOTBALL', 'BASKETBALL', 'SOCCER', 'MMA'. */
  sport: string
  /** Home team/fighter display name. */
  home: string
  /** Away team/fighter display name. */
  away: string
  /** ISO-8601 kickoff/start time. */
  startsAt: string
  status: EventStatus
  markets: NormalizedMarket[]
}

/** Filters/paging passed to a provider's listEvents. All optional; a provider applies
 *  what it can and ignores the rest. */
export interface ListEventsOptions {
  /** Only events in this lifecycle state. */
  status?: EventStatus
  /** ISO-8601 lower/upper bounds on start time. */
  startsAfter?: string
  startsBefore?: string
  /** Cap the number of events (per page); the provider handles cursor paging internally. */
  limit?: number
  /** Restrict to these bookmakers (SGO bookmakerID) to shrink the payload. */
  bookmakerIds?: string[]
  /** Restrict to these SGO oddIDs (markets) to shrink the payload. */
  oddIds?: string[]
  /** Include alternate lines (alt spreads/totals) in the result. */
  includeAltLines?: boolean
}

/**
 * The provider seam: every odds source (SGO, The Odds API, the mock) implements this.
 * The poller drives the ACTIVE provider; players never call a provider directly — they
 * read the Supabase cache the poller fills.
 */
export interface OddsFeedProvider {
  /** Stable identifier for logging/telemetry (e.g. 'sgo', 'mock', 'theoddsapi'). */
  readonly name: string
  /** The current slate for the given leagues. */
  listEvents(leagueIds: string[], opts?: ListEventsOptions): Promise<NormalizedEvent[]>
  /** A single event by id, or null if the provider can't find it. */
  getEvent(eventId: string): Promise<NormalizedEvent | null>
}

/* ───────────────────────── Supabase cache row shapes ─────────────────────────
 * The poller writes these; the UI lane's typed hook (useBookOdds) reads them. They
 * mirror the normalized model in snake_case. Prices are stored as the normalized
 * Selection — both raw and display — so a manual override survives the next poll
 * (the poller preserves overridden display prices; see lib/odds/pricing.ts + poller.ts).
 */

export interface OddsEventRow {
  event_id: string
  league_id: string
  sport: string
  home: string
  away: string
  starts_at: string
  status: EventStatus
  updated_at: string
}

export interface OddsMarketRow {
  market_id: string
  event_id: string
  type: MarketType
  period: string
  stat_id: string | null
  player_id: string | null
  updated_at: string
}

export interface OddsSelectionRow {
  selection_id: string
  market_id: string
  event_id: string
  side: string
  line: number | null
  /** Raw feed price. */
  price_raw_american: number
  price_raw_decimal: number
  /** Display price after house margin/override. */
  price_display_american: number
  price_display_decimal: number
  bookmaker: string
  available: boolean
  /** True when an operator has manually set the display price — the poller must NOT
   *  clobber it with the next feed price (see pricing.applyPricing). */
  override: boolean
  updated_at: string
}
