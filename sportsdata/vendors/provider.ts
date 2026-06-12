/**
 * The vendor-agnostic odds-feed PROVIDER interface (CLAUDE.md §4, §6).
 *
 * Everything above this line — the central poller, the cache, the store, the UI —
 * talks to an `OddsFeedProvider`, never to a vendor's wire format. A provider knows
 * how to pull four things from one vendor and hand them back as our `ApiEvent` DTO
 * (which `sportsdata/map` then normalizes into the internal `GameEvent`):
 *
 *   - fetchOdds()   — fixtures/schedules + pre-match odds (moneyline/spread/total),
 *   - fetchLive()   — in-play odds + live game state,
 *   - fetchScores() — scores/results for grading,
 *   - fetchSlate()  — the unified slate: odds with live + scores merged by event id,
 *                     i.e. exactly what the poller writes to the cache.
 *
 * A vendor adapter only has to provide `fetchOdds` (and, if it has them, `fetchScores`
 * / `fetchLive` / `usage`); `makeProvider` composes the rest the same way for every
 * vendor, so a new vendor is a small mapping file, not a new pipeline.
 */

import type { ApiEvent } from '../types.js'
import type { OddsApiScoreEvent, Quota } from './theOddsApi.js'
import { mergeScores } from './theOddsApi.js'
import { isLiveApi } from './feedTools.js'

/** A scores/results row for grading — id + completed + per-team scores. Vendor-
 *  agnostic (TheOddsAPI's `OddsApiScoreEvent` already matches this shape). */
export type ApiScoreEvent = OddsApiScoreEvent

export interface OddsFeedProvider {
  /** Stable vendor key, e.g. 'theoddsapi' | 'sportsgameodds' | 'mock' | 'oddspapi'. */
  readonly name: string
  /** Fixtures/schedules + pre-match odds snapshot, as `ApiEvent[]`. */
  fetchOdds(): Promise<ApiEvent[]>
  /** In-play odds + live state. Defaults to the live subset of `fetchOdds`. */
  fetchLive(): Promise<ApiEvent[]>
  /** Scores/results for grading (final scores + officiality). */
  fetchScores(): Promise<ApiScoreEvent[]>
  /** The unified, normalize-ready slate: odds with live + scores merged by event id.
   *  This is what the central poller pulls and writes to the cache. */
  fetchSlate(): Promise<ApiEvent[]>
  /** The most recent request quota this vendor reported, or null if it doesn't. */
  usage(): Quota | null
}

/** The parts a concrete vendor adapter supplies; everything optional but `fetchOdds`
 *  is composed into a full `OddsFeedProvider` by `makeProvider`. */
export interface ProviderParts {
  name: string
  fetchOdds: () => Promise<ApiEvent[]>
  fetchScores?: () => Promise<ApiScoreEvent[]>
  fetchLive?: () => Promise<ApiEvent[]>
  usage?: () => Quota | null
}

/**
 * Compose a full `OddsFeedProvider` from a vendor's parts, identically for every
 * vendor: `fetchSlate` merges scores onto odds (so a finished game flips to final
 * with a score and settlement can fire); `fetchLive` defaults to the live subset of
 * the odds pull; `usage` defaults to "not reported". This is the one place the
 * four-method contract is assembled, so adapters stay tiny.
 */
export function makeProvider(parts: ProviderParts): OddsFeedProvider {
  const fetchScores = parts.fetchScores ?? (async () => [] as ApiScoreEvent[])
  const fetchLive = parts.fetchLive ?? (async () => (await parts.fetchOdds()).filter(isLiveApi))
  return {
    name: parts.name,
    fetchOdds: parts.fetchOdds,
    fetchScores,
    fetchLive,
    async fetchSlate() {
      const odds = await parts.fetchOdds()
      const scores = await fetchScores()
      return scores.length > 0 ? mergeScores(odds, scores) : odds
    },
    usage: parts.usage ?? (() => null),
  }
}
