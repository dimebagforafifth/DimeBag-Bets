/**
 * Scheduled polling: the interval helper clamps sanely; `runPollCycle` is COST-DISCIPLINED
 * — mock mode (the default) never touches the real SGO feed — and `schedulePolling` fires a
 * cycle on a repeating interval until stopped. Odds only; no money here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  pollIntervalSeconds,
  isLiveMode,
  runPollCycle,
  schedulePolling,
  DEFAULT_POLL_INTERVAL_SECONDS,
  MIN_POLL_INTERVAL_SECONDS,
} from './schedule.js'
import { SGOProvider } from './providers/SGOProvider.js'
import type { OddsCache } from './poller.js'
import type { NormalizedEvent, Price } from './contract.js'

/** A counting in-memory cache so a cycle can run without Supabase. */
function countingCache() {
  const calls = { events: 0, markets: 0, selections: 0, overrides: 0 }
  const cache: OddsCache = {
    async getOverrides() {
      calls.overrides += 1
      return new Map<string, Price>()
    },
    async writeEvents(rows) {
      calls.events += rows.length
    },
    async writeMarkets(rows) {
      calls.markets += rows.length
    },
    async writeSelections(rows) {
      calls.selections += rows.length
    },
  }
  return { cache, calls }
}

const FAKE_SLATE: NormalizedEvent[] = [
  {
    eventId: 'e1',
    leagueId: 'NBA',
    sport: 'BASKETBALL',
    home: 'Home',
    away: 'Away',
    startsAt: '2026-06-16T00:00:00Z',
    status: 'pre',
    markets: [
      {
        marketId: 'e1:moneyline:game',
        type: 'moneyline',
        period: 'game',
        selections: [
          {
            selectionId: 'e1-ml-home',
            side: 'home',
            priceRaw: { american: -110, decimal: 1.909 },
            priceDisplay: { american: -120, decimal: 1.833 },
            bookmaker: 'fake',
            available: true,
          },
        ],
      },
    ],
  },
]

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('pollIntervalSeconds', () => {
  it('defaults, clamps to the floor, and reads the env', () => {
    expect(pollIntervalSeconds({})).toBe(DEFAULT_POLL_INTERVAL_SECONDS)
    expect(pollIntervalSeconds({ POLL_INTERVAL_SECONDS: '5' })).toBe(MIN_POLL_INTERVAL_SECONDS) // clamped up
    expect(pollIntervalSeconds({ POLL_INTERVAL_SECONDS: '30' })).toBe(30)
    expect(pollIntervalSeconds({ POLL_INTERVAL_SECONDS: 'nonsense' })).toBe(
      DEFAULT_POLL_INTERVAL_SECONDS,
    )
  })

  it('isLiveMode is opt-in', () => {
    expect(isLiveMode({})).toBe(false)
    expect(isLiveMode({ SGO_LIVE: '1' })).toBe(true)
    expect(isLiveMode({ SGO_LIVE: 'true' })).toBe(true)
    expect(isLiveMode({ SGO_LIVE: '0' })).toBe(false)
  })
})

describe('runPollCycle — cost discipline', () => {
  it('mock mode (default) is a no-op and NEVER calls the real SGO feed', async () => {
    const sgoSpy = vi.spyOn(SGOProvider.prototype, 'listEvents')
    const { cache, calls } = countingCache()
    const r = await runPollCycle({ env: {}, cache }) // SGO_LIVE unset, no allowMockRefresh
    expect(r).toMatchObject({ mode: 'mock', ran: false })
    expect(sgoSpy).not.toHaveBeenCalled()
    expect(calls.events).toBe(0) // nothing written
  })

  it('mock refresh uses the MockProvider only — still never the real feed', async () => {
    const sgoSpy = vi.spyOn(SGOProvider.prototype, 'listEvents')
    const { cache, calls } = countingCache()
    const r = await runPollCycle({ env: {}, cache, allowMockRefresh: true })
    expect(r).toMatchObject({ mode: 'mock', ran: true, provider: 'mock' })
    expect(sgoSpy).not.toHaveBeenCalled()
    expect(calls.events).toBeGreaterThan(0) // mock slate written
  })

  it('live mode polls the (injected) provider and writes the cache', async () => {
    const provider = {
      name: 'sgo',
      listEvents: vi.fn(async () => FAKE_SLATE),
      getEvent: vi.fn(async () => null),
    }
    const { cache, calls } = countingCache()
    const r = await runPollCycle({
      env: { SGO_LIVE: '1' },
      provider,
      cache,
      leagues: ['NFL'], // one league → one isolated call (the poller polls per-league)
      now: () => '2026-06-16T00:00:00Z',
    })
    expect(r).toMatchObject({ mode: 'live', ran: true, provider: 'sgo' })
    expect(provider.listEvents).toHaveBeenCalledTimes(1)
    expect(r.counts).toMatchObject({ events: 1, markets: 1, selections: 1 })
    expect(calls.events).toBe(1)
  })

  it('live mode with no cache configured skips (never throws in a cron)', async () => {
    const provider = {
      name: 'sgo',
      listEvents: vi.fn(async () => FAKE_SLATE),
      getEvent: vi.fn(async () => null),
    }
    const r = await runPollCycle({ env: { SGO_LIVE: '1' }, provider }) // no cache, no Supabase env
    expect(r).toMatchObject({ mode: 'live', ran: false })
    expect(r.reason).toMatch(/no Supabase cache/i)
    expect(provider.listEvents).not.toHaveBeenCalled()
  })
})

describe('schedulePolling', () => {
  it('runs a cycle immediately then on each interval, until stopped', async () => {
    vi.useFakeTimers()
    let calls = 0
    const sched = schedulePolling(async () => {
      calls += 1
    }, 1000)

    await vi.advanceTimersByTimeAsync(0) // flush the immediate tick
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toBe(2)
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls).toBe(4)

    sched.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toBe(4) // no more cycles after stop
  })
})
