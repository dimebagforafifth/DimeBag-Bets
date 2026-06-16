/**
 * THE SHARED ODDS CONTRACT (SGO odds layer).
 *
 * ──────────────────────────────────────────────────────────────────────────
 *  // SEAM — OWNED BY THE ODDS-FEED LANE (Agent 1).
 *
 *  Agent 1 builds the providers, poller, pricing (house margin / line overrides)
 *  and writes the Supabase cache tables. This file is the agreed shape BOTH lanes
 *  build to. The book-UI / betting lane (this module's consumer) imports these
 *  types READ-ONLY and never mutates a feed.
 *
 *  Until the feed lane lands, this stub IS the contract — it lets the book UI
 *  compile and render against mock data matching it exactly. When Agent 1's real
 *  contract.ts arrives it REPLACES this file with the same shape; nothing in the
 *  book UI changes (it only ever reads `priceDisplay` via the cache hook).
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Money note: this layer carries no money — it describes prices/lines only. The
 * book UI converts a placed bet into a credit/balance wager through `core` (§3).
 * Points only — no cash, no cash value, no withdrawal.
 */

/** Where an event sits in its lifecycle. Betting is open `pre` + (live markets) `live`. */
export type EventStatus = 'pre' | 'live' | 'ended'

/** The kind of market. `prop` covers player/stat props (points, rebounds, …). */
export type MarketType = 'moneyline' | 'spread' | 'total' | 'prop'

/** The slice of the game a market settles on. Open-ended by design (more periods
 *  exist per sport); these are the ones the book UI renders today. */
export type MarketPeriod = 'game' | '1h' | '2h' | '1q' | '2q' | '3q' | '4q' | 'ot'

/** A price in both notations, so the UI can show American and compute parlay
 *  math from decimal without re-deriving. */
export interface Price {
  american: number
  decimal: number
}

/** One bettable outcome on a market. The book UI ALWAYS shows `priceDisplay`. */
export interface Selection {
  selectionId: string
  /** The side/outcome: 'home' | 'away' | 'over' | 'under', or a prop outcome label. */
  side: string
  /** Spread handicap or total/prop line; undefined for moneyline. */
  line?: number
  /** Raw feed price — the book UI never shows this directly. */
  priceRaw: Price
  /** Price after house margin / operator override — what the player sees and bets. */
  priceDisplay: Price
  /** Source book the raw price came from. */
  bookmaker: string
  /** False when suspended / off the board: the price shows but can't be added. */
  available: boolean
}

/** A market on an event — a set of selections of one type/period. */
export interface NormalizedMarket {
  marketId: string
  type: MarketType
  period: MarketPeriod
  /** For totals / props: the stat keyed (e.g. 'points', 'rebounds', 'goals'). */
  statId?: string
  /** For player props: the player the prop is on. */
  playerId?: string
  selections: Selection[]
}

/** A fully-normalized event with all its markets, ready for the book to render. */
export interface NormalizedEvent {
  eventId: string
  leagueId: string
  sport: string
  home: string
  away: string
  /** ISO 8601 kickoff time. */
  startsAt: string
  status: EventStatus
  markets: NormalizedMarket[]
}

/** Options for a slate query. */
export interface ListEventsOpts {
  status?: EventStatus
  /** Cap the number of events returned. */
  limit?: number
}

/**
 * The feed seam Agent 1 implements (a vendor adapter behind it). The book UI does
 * NOT call this directly — it reads the Supabase cache (which Agent 1 populates
 * from this) via the `useBookOdds()` hook. Declared here so both lanes share it.
 */
export interface OddsFeedProvider {
  listEvents(
    leagueIds: string[],
    opts?: ListEventsOpts,
  ): Promise<NormalizedEvent[]> | NormalizedEvent[]
  getEvent(eventId: string): Promise<NormalizedEvent | null> | NormalizedEvent | null
}

/* --------------------------- Supabase cache rows -------------------------- */
/* Agent 1 defines the schema + writes these; the book UI reads them via a typed
 * hook + realtime subscription (see app/book/odds-source.ts). Shapes declared
 * here so the read side is typed against the same contract.                   */

export interface OddsEventRow {
  event_id: string
  league_id: string
  sport: string
  home: string
  away: string
  starts_at: string
  status: EventStatus
}

export interface OddsMarketRow {
  market_id: string
  event_id: string
  type: MarketType
  period: MarketPeriod
  stat_id: string | null
  player_id: string | null
}

export interface OddsSelectionRow {
  selection_id: string
  market_id: string
  side: string
  line: number | null
  price_raw_american: number
  price_raw_decimal: number
  price_display_american: number
  price_display_decimal: number
  bookmaker: string
  available: boolean
}
