/**
 * The shape of a generic third-party odds + scores API (modeled on the common
 * "h2h / spreads / totals" feeds, e.g. The Odds API). This is the EXTERNAL DTO —
 * deliberately separate from our internal `GameEvent` so the rest of the app
 * never sees a vendor's shape. `map.ts` translates these into `GameEvent`s; swap
 * vendors by changing only the mapping, not the app.
 */

/** One priced outcome within a market. `price` is American odds; `point` is the
 *  handicap (spreads) or line (totals); absent for moneyline. */
export interface ApiOutcome {
  name: string
  price: number
  point?: number
}

export interface ApiMarket {
  key: 'h2h' | 'spreads' | 'totals'
  outcomes: ApiOutcome[]
}

export interface ApiBookmaker {
  key: string
  markets: ApiMarket[]
}

/** A per-team score line, as live/score endpoints typically return them. */
export interface ApiScore {
  name: string
  score: number
}

export interface ApiEvent {
  id: string
  /** Sport group key, e.g. "basketball_nba" → our `sport` ("Basketball"). Optional:
   *  feeds that omit it fall back to grouping by the league title. */
  sport_key?: string
  /** League / competition title → our `league`. */
  sport_title: string
  home_team: string
  away_team: string
  /** ISO kickoff time → our `startsAt` display label. */
  commence_time: string
  /** Vendors that expose lifecycle directly; otherwise we derive it. */
  status?: 'upcoming' | 'live' | 'final'
  /** True once the game is officially over. */
  completed?: boolean
  /** Explicit officiality override (false → the game voids). */
  official?: boolean
  /** Per-team scores (present once in play). */
  scores?: ApiScore[] | null
  /** Live clock label (e.g. "Q3"), if the vendor provides one. */
  clock?: string
  /** Fraction of the game elapsed 0..1, if the vendor provides one. */
  progress?: number
  /** Priced markets, per bookmaker. We read one book (see map options). */
  bookmakers: ApiBookmaker[]
}
