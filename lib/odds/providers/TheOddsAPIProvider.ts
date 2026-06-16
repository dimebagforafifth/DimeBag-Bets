/**
 * TheOddsAPIProvider — fallback odds source against the SAME OddsFeedProvider contract.
 *
 * Why it exists: SGO has gaps (notably BOXING is not in SGO's league list, and a free-tier
 * cap could constrain UFC/MMA volume). The Odds API (v4) is the documented fallback for
 * those — the app already carries a key for it (VITE_ODDS_API_KEY, see .env.example).
 *
 * STATUS: SCAFFOLD. This is a real, conforming stub — it wires config + the interface, but
 * does NOT yet map The Odds API's response into NormalizedEvent. It never fabricates data:
 * unconfigured (or until the mapping lands) it returns an empty slate. Implement
 * `normalizeOddsApiEvent` when we actually need MMA/boxing coverage off SGO.
 *
 * // SEAM(mapping): The Odds API v4 GET /v4/sports/{sport}/events/{id}/odds returns
 * { id, sport_key, commence_time, home_team, away_team, bookmakers:[{ key, markets:[{ key:
 * 'h2h'|'spreads'|'totals', outcomes:[{ name, price, point }] }] }] }. Map h2h→moneyline,
 * spreads→spread (point→line), totals→total, price(decimal)→Price, commence_time→startsAt.
 */

import type { ListEventsOptions, NormalizedEvent, OddsFeedProvider } from '../contract.js'

export interface TheOddsAPIConfig {
  apiKey?: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

const BASE_URL = 'https://api.the-odds-api.com/v4'

export class TheOddsAPIProvider implements OddsFeedProvider {
  readonly name = 'theoddsapi'
  private readonly apiKey: string
  // baseUrl/fetch are retained for the real implementation (see SEAM above).
  private readonly baseUrl: string
  private readonly doFetch: typeof fetch

  constructor(cfg: TheOddsAPIConfig = {}) {
    this.apiKey = cfg.apiKey ?? readEnv('VITE_ODDS_API_KEY')
    this.baseUrl = cfg.baseUrl ?? BASE_URL
    this.doFetch = cfg.fetchImpl ?? globalThis.fetch
  }

  /** True once a key is present AND the mapping is implemented. Today the mapping is a
   *  scaffold, so this stays false and the poller never selects it as active. */
  get configured(): boolean {
    return false
  }

  async listEvents(_leagueIds: string[], _opts: ListEventsOptions = {}): Promise<NormalizedEvent[]> {
    // SCAFFOLD: no mapping yet → return an empty slate rather than fake data.
    void this.baseUrl
    void this.doFetch
    void this.apiKey
    return []
  }

  async getEvent(_eventId: string): Promise<NormalizedEvent | null> {
    return null
  }
}

function readEnv(name: string): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return env?.[name] ?? ''
}
