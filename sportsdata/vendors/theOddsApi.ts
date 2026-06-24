/**
 * The Odds API client (CLAUDE.md §4, §6) — the concrete vendor adapter the feed
 * seam was built for.
 *
 * `sportsdata/httpFeed.ts` already polls a `fetchSlate()` and maps the result
 * into `GameEvent`s. This file produces that `fetchSlate` against a real vendor
 * (modeled on The Odds API v4), covering BOTH:
 *   - **pre-match odds** — the `/odds` endpoint returns priced upcoming games;
 *   - **live odds + scores** — the `/scores` endpoint returns in-play and just-
 *     finished games, which we MERGE into the odds slate by event id so the
 *     mapper can flip a game to `live`/`final` and settlement can fire.
 *
 * The odds response already matches our `ApiEvent` shape (same `sport_title` /
 * `home_team` / `commence_time` / `bookmakers` fields), so we only need to graft
 * scores on. `fetchFn` is injected, so the whole client is unit-testable without
 * a network. Wire it up where the store is created:
 *
 *   createStore(account, { feed: createHttpFeed({
 *     fetchSlate: createOddsApiSlate({ config }),
 *   }) })
 */

import type { ApiEvent, ApiScore } from '../types.js'
import { validateApiEvents, validateOddsApiScoreEvents } from './validation.js'

export interface OddsApiConfig {
  /** Vendor API key. */
  apiKey: string
  /** Sport keys to pull, e.g. 'basketball_nba', 'americanfootball_nfl'. */
  sportKeys: string[]
  /** API base. Default The Odds API v4. */
  baseUrl?: string
  /** Comma-separated regions for prices. Default 'us'. */
  regions?: string
  /** Comma-separated markets. Default 'h2h,spreads,totals'. */
  markets?: string
  /** Price format. Default 'american' (matches our odds model). */
  oddsFormat?: 'american' | 'decimal'
  /** Scores lookback window in days (to include just-finished games). Default 1. */
  daysFrom?: number
}

const DEFAULTS = {
  baseUrl: 'https://api.the-odds-api.com/v4',
  regions: 'us',
  markets: 'h2h,spreads,totals',
  oddsFormat: 'american' as const,
  daysFrom: 1,
}

/** The pre-match/odds request URL for one sport. */
export function oddsUrl(config: OddsApiConfig, sportKey: string): string {
  const base = config.baseUrl ?? DEFAULTS.baseUrl
  const params = new URLSearchParams({
    apiKey: config.apiKey,
    regions: config.regions ?? DEFAULTS.regions,
    markets: config.markets ?? DEFAULTS.markets,
    oddsFormat: config.oddsFormat ?? DEFAULTS.oddsFormat,
  })
  return `${base}/sports/${encodeURIComponent(sportKey)}/odds/?${params}`
}

/** The live scores request URL for one sport. */
export function scoresUrl(config: OddsApiConfig, sportKey: string): string {
  const base = config.baseUrl ?? DEFAULTS.baseUrl
  const params = new URLSearchParams({
    apiKey: config.apiKey,
    daysFrom: String(config.daysFrom ?? DEFAULTS.daysFrom),
  })
  return `${base}/sports/${encodeURIComponent(sportKey)}/scores/?${params}`
}

/** A `/scores` element (a subset of what the vendor returns). `score` arrives as
 *  a string from the vendor; we coerce it. */
export interface OddsApiScoreEvent {
  id: string
  completed?: boolean
  scores?: { name: string; score: string | number }[] | null
}

/**
 * Merge live scores into the odds slate by event id, producing `ApiEvent[]` with
 * `scores` / `completed` filled in. Events with no score row stay pre-match;
 * events with scores become live; completed ones become final. Numeric coercion
 * is defensive (vendor sends score as a string).
 */
export function mergeScores(odds: ApiEvent[], scores: OddsApiScoreEvent[]): ApiEvent[] {
  const byId = new Map(scores.map((s) => [s.id, s]))
  return odds.map((ev) => {
    const s = byId.get(ev.id)
    if (!s) return ev
    const mapped: ApiScore[] | null =
      s.scores && s.scores.length > 0
        ? s.scores.map((row) => ({ name: row.name, score: Number(row.score) }))
        : null
    return { ...ev, scores: mapped, completed: s.completed ?? ev.completed }
  })
}

/** API quota, read from the vendor's response headers. */
export interface Quota {
  remaining: number | null
  used: number | null
}

/** A minimal fetch shape — the global `fetch` satisfies it, and tests inject a stub. */
export type FetchLike = (url: string) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
  headers: { get(name: string): string | null }
}>

export interface OddsApiClientOptions {
  config: OddsApiConfig
  /** Injected for testability; defaults to global `fetch`. */
  fetchFn?: FetchLike
  /** Also pull live scores and merge them (a second request per sport). Default true. */
  includeScores?: boolean
  /** Notified with the remaining/used request quota after each odds call. */
  onQuota?: (quota: Quota) => void
}

export function readQuota(headers: { get(name: string): string | null }): Quota {
  const num = (v: string | null) => (v == null || v === '' ? null : Number(v))
  return { remaining: num(headers.get('x-requests-remaining')), used: num(headers.get('x-requests-used')) }
}

/**
 * Build a `fetchSlate` for `createHttpFeed`: pull odds (and, by default, live
 * scores) for every configured sport, merge them, and return one `ApiEvent[]`
 * slate spanning pre-match and in-play games.
 */
export function createOddsApiSlate(opts: OddsApiClientOptions): () => Promise<ApiEvent[]> {
  const includeScores = opts.includeScores ?? true
  return async () => {
    const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike | undefined)
    if (!fetchFn) throw new Error('fetch is not available; inject fetchFn')

    const slate: ApiEvent[] = []
    for (const sport of opts.config.sportKeys) {
      const oddsRes = await fetchFn(oddsUrl(opts.config, sport))
      if (!oddsRes.ok) throw new Error(`odds request for ${sport} responded ${oddsRes.status}`)
      opts.onQuota?.(readQuota(oddsRes.headers))
      const odds = validateApiEvents(await oddsRes.json(), 'odds')

      let events = odds
      if (includeScores) {
        const scoresRes = await fetchFn(scoresUrl(opts.config, sport))
        if (scoresRes.ok) {
          const scores = validateOddsApiScoreEvents(await scoresRes.json(), 'scores')
          events = mergeScores(odds, scores)
        }
        // a failed scores call is non-fatal: keep the pre-match odds.
      }
      slate.push(...events)
    }
    return slate
  }
}
