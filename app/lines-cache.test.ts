import { describe, it, expect, beforeEach } from 'vitest'
import {
  ingestSlate,
  getCachedSlate,
  getLinesCacheVersion,
  linesCacheFeed,
  clearLinesCache,
} from './lines-cache.js'
import { createIngestionPoller, mapSlate } from '../sportsdata/index.js'
import { makeProvider, MOCK_SLATE } from '../sportsdata/vendors/index.js'

beforeEach(() => clearLinesCache())

describe('lines cache', () => {
  it('ingests a normalized slate, merges by id, and bumps the version', () => {
    const slate = mapSlate(MOCK_SLATE)
    const v0 = getLinesCacheVersion()
    ingestSlate(slate)
    expect(getCachedSlate()).toHaveLength(4)
    expect(getLinesCacheVersion()).toBe(v0 + 1)

    // a partial pull updates the games it carries without dropping the rest
    const lal = { ...slate.find((e) => e.id === 'mock-nba-lal-bos')!, status: 'live' as const }
    ingestSlate([lal])
    expect(getCachedSlate()).toHaveLength(4) // merged, not appended
    expect(getCachedSlate().find((e) => e.id === 'mock-nba-lal-bos')?.status).toBe('live')
  })

  it('the cache feed mirrors the cache; player subscribers never trigger a vendor call', async () => {
    let vendorCalls = 0
    const provider = makeProvider({
      name: 'spy',
      fetchOdds: async () => {
        vendorCalls += 1
        return MOCK_SLATE
      },
    })
    const poller = createIngestionPoller({
      provider,
      onSlate: ingestSlate,
      setTimer: () => 0 as unknown as ReturnType<typeof setTimeout>,
      clearTimer: () => {},
    })

    await poller.refresh() // poll #1 → 1 vendor call
    const feed = linesCacheFeed()
    let emissions = 0
    // five "player" stores subscribe to the cache feed
    const unsubs = Array.from({ length: 5 }, () => feed.subscribe(() => (emissions += 1)))
    expect(feed.snapshot()).toHaveLength(4)

    await poller.refresh() // poll #2 → cache changes → every subscriber re-emitted
    unsubs.forEach((u) => u())

    expect(vendorCalls).toBe(2) // ONLY the two poller pulls — subscribers added zero
    expect(emissions).toBe(5) // all five players got the update from the cache
  })
})
