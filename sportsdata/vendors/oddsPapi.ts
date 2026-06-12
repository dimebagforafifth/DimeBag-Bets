/**
 * OddsPapi adapter — STUB (CLAUDE.md §4, §6).
 *
 * A placeholder that already satisfies the `OddsFeedProvider` contract so it can be
 * registered, selected, and wired into the central poller exactly like a live vendor —
 * it just throws until the real mapping lands. When OddsPapi is integrated, fill in
 * `fetchOdds` (and `fetchScores` if it has a separate endpoint) with the vendor → DTO
 * mapping, the same way `sportsGameOdds.ts` does. Everything downstream is ready.
 */

import type { ApiEvent } from '../types.js'
import { makeProvider, type OddsFeedProvider } from './provider.js'
import type { Quota } from './theOddsApi.js'

export interface OddsPapiConfig {
  apiKey: string
  leagues?: string[]
  baseUrl?: string
}

export interface OddsPapiProviderOptions {
  config: OddsPapiConfig
}

export function createOddsPapiProvider(_opts: OddsPapiProviderOptions): OddsFeedProvider {
  // TODO(api): implement the OddsPapi → ApiEvent mapping (fixtures/odds/live/scores)
  // and return real data here. Until then the provider is registered but inert.
  const notImplemented = async (): Promise<ApiEvent[]> => {
    throw new Error('OddsPapi adapter is not implemented yet (// TODO)')
  }
  return makeProvider({
    name: 'oddspapi',
    fetchOdds: notImplemented,
    usage: (): Quota | null => null,
  })
}
