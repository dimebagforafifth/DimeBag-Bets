/**
 * SportsGameOdds adapter (CLAUDE.md §4, §6) — the primary candidate vendor.
 *
 * SportsGameOdds returns one document per event with the teams nested and the prices
 * keyed by a market id (a different wire shape from The Odds API's flat
 * bookmaker→markets→outcomes). This file is the ONLY place that knows that shape: it
 * maps a `SgoEvent` into our shared `ApiEvent` DTO, so `sportsdata/map` and everything
 * downstream are untouched. `fetchFn` is injected for testability.
 *
 * The DTO below is modelled on SportsGameOdds' v2 `/events` response (the fields we
 * need: id, league, teams, status, scores, and the three core markets). If their exact
 * field names differ at integration time, this mapper is the single edit point.
 */

import type { ApiBookmaker, ApiEvent, ApiMarket, ApiOutcome } from '../types.js'
import { makeProvider, type ApiScoreEvent, type OddsFeedProvider } from './provider.js'
import type { FetchLike, Quota } from './theOddsApi.js'

/** A team as SportsGameOdds nests it. */
export interface SgoTeam {
  name: string
  /** Final/running score, present once the game is in play. */
  score?: number | string
}

/** One priced side. `odds` is American; `point` is the handicap (spread) or line
 *  (total), absent for moneyline. `side` says which outcome it is. */
export interface SgoOutcome {
  side: 'home' | 'away' | 'over' | 'under'
  odds: number
  point?: number
}

/** A SportsGameOdds market, keyed by type. */
export interface SgoMarket {
  type: 'moneyline' | 'spread' | 'total'
  outcomes: SgoOutcome[]
}

export interface SgoEvent {
  eventID: string
  /** League/competition title → our `league`. */
  leagueID: string
  /** Sport group, e.g. 'BASKETBALL' → our `sport`. */
  sportID?: string
  home: SgoTeam
  away: SgoTeam
  /** ISO kickoff. */
  startTime: string
  /** Lifecycle, if the vendor states it directly. */
  status?: 'scheduled' | 'live' | 'final'
  /** True once the game is officially complete. */
  finalized?: boolean
  markets: SgoMarket[]
}

const SIDE_LABELS = { home: 'home', away: 'away', over: 'over', under: 'under' } as const

/** Map SportsGameOdds' lifecycle words onto The Odds API's `status` vocabulary, which
 *  our DTO already speaks. */
function sgoStatus(e: SgoEvent): ApiEvent['status'] {
  if (e.status === 'scheduled') return 'upcoming'
  if (e.status === 'final' || e.finalized) return 'final'
  if (e.status === 'live') return 'live'
  return undefined // let the mapper derive it from scores/completed
}

/** One SGO market → one of our `ApiMarket`s (outcomes named/pointed our DTO's way). */
function sgoMarket(e: SgoEvent, m: SgoMarket): ApiMarket {
  const key: ApiMarket['key'] = m.type === 'moneyline' ? 'h2h' : m.type === 'spread' ? 'spreads' : 'totals'
  const outcomes: ApiOutcome[] = m.outcomes.map((o) => {
    // Our DTO names h2h/spread outcomes by team and totals by Over/Under.
    const name =
      o.side === 'home' ? e.home.name : o.side === 'away' ? e.away.name : SIDE_LABELS[o.side]
    return { name: name.charAt(0).toUpperCase() + name.slice(1), price: o.odds, point: o.point }
  })
  return { key, outcomes }
}

/** One `SgoEvent` → our shared `ApiEvent` DTO. */
export function mapSgoEvent(e: SgoEvent): ApiEvent {
  const num = (v: number | string | undefined) => (v == null ? undefined : Number(v))
  const homeScore = num(e.home.score)
  const awayScore = num(e.away.score)
  const scores =
    homeScore != null && awayScore != null
      ? [
          { name: e.home.name, score: homeScore },
          { name: e.away.name, score: awayScore },
        ]
      : null
  const bookmaker: ApiBookmaker = { key: 'sportsgameodds', markets: e.markets.map((m) => sgoMarket(e, m)) }
  return {
    id: e.eventID,
    sport_key: e.sportID ? e.sportID.toLowerCase() : undefined,
    sport_title: e.leagueID,
    home_team: e.home.name,
    away_team: e.away.name,
    commence_time: e.startTime,
    status: sgoStatus(e),
    completed: e.finalized,
    scores,
    bookmakers: [bookmaker],
  }
}

export interface SportsGameOddsConfig {
  apiKey: string
  /** League ids to pull, e.g. ['NBA', 'NFL']. */
  leagueIDs: string[]
  baseUrl?: string
}

const DEFAULT_BASE = 'https://api.sportsgameodds.com/v2'

export interface SportsGameOddsProviderOptions {
  config: SportsGameOddsConfig
  fetchFn?: FetchLike
}

export function eventsUrl(config: SportsGameOddsConfig, leagueID: string): string {
  const base = config.baseUrl ?? DEFAULT_BASE
  const params = new URLSearchParams({ apiKey: config.apiKey, leagueID })
  return `${base}/events/?${params}`
}

export function createSportsGameOddsProvider(opts: SportsGameOddsProviderOptions): OddsFeedProvider {
  let lastQuota: Quota | null = null
  const resolveFetch = (): FetchLike => {
    const f = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike | undefined)
    if (!f) throw new Error('fetch is not available; inject fetchFn')
    return f
  }

  // SportsGameOdds returns odds + live state + scores in one events document, so a
  // single pull covers fetchOdds AND scores; makeProvider's fetchSlate merges nothing
  // extra because the scores already ride on each event.
  const fetchOdds = async (): Promise<ApiEvent[]> => {
    const f = resolveFetch()
    const out: ApiEvent[] = []
    for (const league of opts.config.leagueIDs) {
      const res = await f(eventsUrl(opts.config, league))
      if (!res.ok) throw new Error(`events request for ${league} responded ${res.status}`)
      const remaining = Number(res.headers.get('x-ratelimit-remaining'))
      lastQuota = { remaining: Number.isFinite(remaining) ? remaining : null, used: null }
      const body = (await res.json()) as { events?: SgoEvent[] } | SgoEvent[]
      const events = Array.isArray(body) ? body : (body.events ?? [])
      out.push(...events.map(mapSgoEvent))
    }
    return out
  }

  return makeProvider({
    name: 'sportsgameodds',
    fetchOdds,
    // Scores ride on the events document, so a separate scores pull isn't needed.
    fetchScores: async () => [] as ApiScoreEvent[],
    usage: () => lastQuota,
  })
}
