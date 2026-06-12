/**
 * Wire the ONE ingestion poller to the lines cache (CLAUDE.md §4, §6).
 *
 * This is the single place a vendor is polled. `startOddsIngestion` spins up the central
 * poller against a chosen `OddsFeedProvider`, points its output at the cache's
 * `ingestSlate`, mirrors its health and quota usage, and returns a handle to stop it.
 * Player/operator stores read the cache via `linesCacheFeed()` and never see the vendor.
 *
 * `defaultOddsProvider()` is the offline default (the seeded Mock provider) so the app
 * runs the real ingestion → cache → feed path with no keys. When a real vendor is
 * configured, swap it for `createTheOddsApiProvider(...)` / `createSportsGameOddsProvider(...)`
 * — nothing else changes. // TODO(api): select by env keys like the persistence seam.
 */

import { ingestSlate, setCacheHealth } from './lines-cache.js'
import { createIngestionPoller, type IngestionOptions, type IngestionPoller } from '../sportsdata/ingestion.js'
import {
  createMockProvider,
  createUsageLog,
  type OddsFeedProvider,
  type UsageLog,
} from '../sportsdata/vendors/index.js'

/** The provider the app polls when none is configured: the offline seeded Mock. */
export function defaultOddsProvider(): OddsFeedProvider {
  return createMockProvider()
}

export interface OddsIngestionHandle {
  poller: IngestionPoller
  usage: UsageLog
  stop(): void
}

/** Start the single poller feeding the cache. Returns a handle (stop + the usage log). */
export function startOddsIngestion(
  provider: OddsFeedProvider = defaultOddsProvider(),
  opts: Omit<IngestionOptions, 'provider' | 'onSlate'> = {},
): OddsIngestionHandle {
  const usage = createUsageLog()
  // `poller` is referenced inside the callbacks, but they only run after start() — well
  // after this const is initialized — so the closure is safe.
  const poller: IngestionPoller = createIngestionPoller({
    provider,
    onSlate: (events) => {
      ingestSlate(events)
      setCacheHealth(poller.getHealth())
    },
    onUsage: (vendor, quota) => usage.record(vendor, quota),
    onError: () => setCacheHealth(poller.getHealth()),
    ...opts,
  })
  poller.start()
  setCacheHealth(poller.getHealth())
  return { poller, usage, stop: () => poller.stop() }
}
