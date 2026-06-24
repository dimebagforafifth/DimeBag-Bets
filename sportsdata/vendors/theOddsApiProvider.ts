/**
 * The Odds API as an `OddsFeedProvider` (CLAUDE.md §4, §6).
 *
 * Wraps the existing raw client (oddsUrl/scoresUrl/readQuota) in the vendor-agnostic
 * provider contract so the central poller can treat it like any other vendor. Pulls
 * pre-match odds and scores from the two endpoints separately (so `fetchScores` can be
 * polled on its own faster cadence), recording the quota the vendor reports in its
 * response headers for usage monitoring. `fetchFn` is injected, so it's testable
 * without a network.
 */

import type { ApiEvent } from '../types.js'
import { makeProvider, type ApiScoreEvent, type OddsFeedProvider } from './provider.js'
import {
  oddsUrl,
  scoresUrl,
  readQuota,
  type FetchLike,
  type OddsApiConfig,
  type Quota,
} from './theOddsApi.js'
import { validateApiEvents, validateOddsApiScoreEvents } from './validation.js'

export interface TheOddsApiProviderOptions {
  config: OddsApiConfig
  /** Injected for testability; defaults to the global `fetch`. */
  fetchFn?: FetchLike
}

export function createTheOddsApiProvider(opts: TheOddsApiProviderOptions): OddsFeedProvider {
  let lastQuota: Quota | null = null
  const resolveFetch = (): FetchLike => {
    const f = opts.fetchFn ?? (globalThis.fetch as unknown as FetchLike | undefined)
    if (!f) throw new Error('fetch is not available; inject fetchFn')
    return f
  }

  const fetchOdds = async (): Promise<ApiEvent[]> => {
    const f = resolveFetch()
    const out: ApiEvent[] = []
    for (const sport of opts.config.sportKeys) {
      const res = await f(oddsUrl(opts.config, sport))
      if (!res.ok) throw new Error(`odds request for ${sport} responded ${res.status}`)
      lastQuota = readQuota(res.headers)
      out.push(...validateApiEvents(await res.json(), 'odds'))
    }
    return out
  }

  const fetchScores = async (): Promise<ApiScoreEvent[]> => {
    const f = resolveFetch()
    const out: ApiScoreEvent[] = []
    for (const sport of opts.config.sportKeys) {
      const res = await f(scoresUrl(opts.config, sport))
      // A failed scores call is non-fatal — pre-match odds still stand.
      if (res.ok) out.push(...validateOddsApiScoreEvents(await res.json(), 'scores'))
    }
    return out
  }

  return makeProvider({ name: 'theoddsapi', fetchOdds, fetchScores, usage: () => lastQuota })
}
