import { describe, it, expect } from 'vitest'
import {
  buildRows,
  Poller,
  selectProvider,
  ACTIVE_LEAGUES,
  type OddsCache,
} from './poller.js'
import { MockProvider, MOCK_EVENTS } from './providers/MockProvider.js'
import { applyMargin, priceFromAmerican, makeOverride, DEFAULT_MARGIN } from './pricing.js'
import type {
  NormalizedEvent,
  OddsEventRow,
  OddsMarketRow,
  OddsSelectionRow,
  Price,
} from './contract.js'

const NOW = '2026-06-15T12:00:00.000Z'

/**
 * A tiny hand-built slate: one event, two markets (moneyline + spread), so the row
 * counts are easy to reason about. ml-home raw is -120, spread raw is -110.
 */
function tinySlate(): NormalizedEvent[] {
  return [
    {
      eventId: 'ev-1',
      leagueId: 'NBA',
      sport: 'BASKETBALL',
      home: 'Home',
      away: 'Away',
      startsAt: '2026-06-15T23:00:00Z',
      status: 'pre',
      markets: [
        {
          marketId: 'ev-1:moneyline:game',
          type: 'moneyline',
          period: 'game',
          selections: [
            {
              selectionId: 'ev-1-ml-home',
              side: 'home',
              priceRaw: priceFromAmerican(-120),
              priceDisplay: applyMargin(priceFromAmerican(-120)),
              bookmaker: 'mock',
              available: true,
            },
            {
              selectionId: 'ev-1-ml-away',
              side: 'away',
              priceRaw: priceFromAmerican(105),
              priceDisplay: applyMargin(priceFromAmerican(105)),
              bookmaker: 'mock',
              available: true,
            },
          ],
        },
        {
          marketId: 'ev-1:spread:game',
          type: 'spread',
          period: 'game',
          selections: [
            {
              selectionId: 'ev-1-sp-home',
              side: 'home',
              line: -3.5,
              priceRaw: priceFromAmerican(-110),
              priceDisplay: applyMargin(priceFromAmerican(-110)),
              bookmaker: 'mock',
              available: false,
            },
            {
              selectionId: 'ev-1-sp-away',
              side: 'away',
              line: 3.5,
              priceRaw: priceFromAmerican(-110),
              priceDisplay: applyMargin(priceFromAmerican(-110)),
              bookmaker: 'mock',
              available: true,
            },
          ],
        },
      ],
    },
  ]
}

describe('buildRows — flattening NormalizedEvent[] into snake_case cache rows', () => {
  it('flattens events/markets/selections with correct snake_case fields and a fixed now', () => {
    const slate = tinySlate()
    const { events, markets, selections } = buildRows(slate, new Map(), DEFAULT_MARGIN, NOW)

    // one event, two markets, four selections
    expect(events).toHaveLength(1)
    expect(markets).toHaveLength(2)
    expect(selections).toHaveLength(4)

    const ev: OddsEventRow = events[0]
    expect(ev).toEqual({
      event_id: 'ev-1',
      league_id: 'NBA',
      sport: 'BASKETBALL',
      home: 'Home',
      away: 'Away',
      starts_at: '2026-06-15T23:00:00Z',
      status: 'pre',
      updated_at: NOW,
    })

    const mlMarket: OddsMarketRow | undefined = markets.find((m) => m.market_id === 'ev-1:moneyline:game')
    expect(mlMarket).toEqual({
      market_id: 'ev-1:moneyline:game',
      event_id: 'ev-1',
      type: 'moneyline',
      period: 'game',
      stat_id: null,
      player_id: null,
      updated_at: NOW,
    })

    // moneyline home selection: no line → line === null, snake_case raw+display present
    const mlHome: OddsSelectionRow | undefined = selections.find((s) => s.selection_id === 'ev-1-ml-home')
    expect(mlHome).toBeDefined()
    expect(mlHome!.market_id).toBe('ev-1:moneyline:game')
    expect(mlHome!.event_id).toBe('ev-1')
    expect(mlHome!.side).toBe('home')
    expect(mlHome!.line).toBeNull()
    expect(mlHome!.bookmaker).toBe('mock')
    expect(mlHome!.available).toBe(true)
    expect(mlHome!.updated_at).toBe(NOW)
    expect(mlHome!.override).toBe(false)

    // raw price reflects the feed exactly
    const rawHome = priceFromAmerican(-120)
    expect(mlHome!.price_raw_american).toBe(rawHome.american)
    expect(mlHome!.price_raw_decimal).toBe(rawHome.decimal)
    // display price is the margined raw (no override here)
    const dispHome = applyMargin(rawHome, DEFAULT_MARGIN)
    expect(mlHome!.price_display_american).toBe(dispHome.american)
    expect(mlHome!.price_display_decimal).toBe(dispHome.decimal)

    // spread selection carries its line through
    const spHome = selections.find((s) => s.selection_id === 'ev-1-sp-home')
    expect(spHome!.line).toBe(-3.5)
    expect(spHome!.available).toBe(false)

    // every row stamped with the same fixed now
    for (const row of [...events, ...markets, ...selections]) {
      expect(row.updated_at).toBe(NOW)
    }
  })

  it('populates stat_id and player_id for a prop market (and null for team markets)', () => {
    // Use the LIVE NBA mock event which carries a LeBron points prop.
    const nba = MOCK_EVENTS.find((e) => e.eventId === 'mock-nba-lal-bos')!
    const { markets } = buildRows([nba], new Map(), DEFAULT_MARGIN, NOW)

    const prop = markets.find((m) => m.type === 'prop')
    expect(prop).toBeDefined()
    expect(prop!.stat_id).toBe('points')
    expect(prop!.player_id).toBe('p-lebron')

    const ml = markets.find((m) => m.type === 'moneyline')
    expect(ml!.stat_id).toBeNull()
    expect(ml!.player_id).toBeNull()
  })

  it('flattens the full MOCK_EVENTS slate with one row per event and child counts intact', () => {
    const { events, markets, selections, overridesPreserved } = buildRows(
      MOCK_EVENTS,
      new Map(),
      DEFAULT_MARGIN,
      NOW,
    )
    expect(events).toHaveLength(MOCK_EVENTS.length)
    const expectedMarkets = MOCK_EVENTS.reduce((n, e) => n + e.markets.length, 0)
    const expectedSelections = MOCK_EVENTS.reduce(
      (n, e) => n + e.markets.reduce((mn, m) => mn + m.selections.length, 0),
      0,
    )
    expect(markets).toHaveLength(expectedMarkets)
    expect(selections).toHaveLength(expectedSelections)
    // No overrides supplied → none preserved, every selection override=false.
    expect(overridesPreserved).toBe(0)
    expect(selections.every((s) => s.override === false)).toBe(true)
  })
})

describe('buildRows — override preservation', () => {
  it('keeps the override display price, marks override=true, counts it, raw still reflects feed', () => {
    const slate = tinySlate()
    // Operator hand-set the moneyline home line to +135.
    const override: Price = makeOverride(135)
    const overrides = new Map<string, Price>([['ev-1-ml-home', override]])

    const { selections, overridesPreserved } = buildRows(slate, overrides, DEFAULT_MARGIN, NOW)

    expect(overridesPreserved).toBe(1)

    const overridden = selections.find((s) => s.selection_id === 'ev-1-ml-home')!
    // display === the override verbatim
    expect(overridden.override).toBe(true)
    expect(overridden.price_display_american).toBe(override.american)
    expect(overridden.price_display_decimal).toBe(override.decimal)

    // raw STILL reflects the fresh feed price (-120), NOT the override
    const rawHome = priceFromAmerican(-120)
    expect(overridden.price_raw_american).toBe(rawHome.american)
    expect(overridden.price_raw_decimal).toBe(rawHome.decimal)
    // sanity: the override display differs from what the margin would have produced
    const margined = applyMargin(rawHome, DEFAULT_MARGIN)
    expect(overridden.price_display_american).not.toBe(margined.american)

    // every NON-overridden selection gets the margined display + override=false
    for (const s of selections) {
      if (s.selection_id === 'ev-1-ml-home') continue
      expect(s.override).toBe(false)
      const raw: Price = { american: s.price_raw_american, decimal: s.price_raw_decimal }
      const expectedDisplay = applyMargin(raw, DEFAULT_MARGIN)
      expect(s.price_display_american).toBe(expectedDisplay.american)
      expect(s.price_display_decimal).toBe(expectedDisplay.decimal)
    }
  })

  it('counts multiple preserved overrides across selections', () => {
    const slate = tinySlate()
    const overrides = new Map<string, Price>([
      ['ev-1-ml-home', makeOverride(135)],
      ['ev-1-sp-away', makeOverride(-105)],
    ])
    const { overridesPreserved, selections } = buildRows(slate, overrides, DEFAULT_MARGIN, NOW)
    expect(overridesPreserved).toBe(2)
    expect(selections.filter((s) => s.override).map((s) => s.selection_id).sort()).toEqual([
      'ev-1-ml-home',
      'ev-1-sp-away',
    ])
  })

  it('ignores override entries that match no selection', () => {
    const slate = tinySlate()
    const overrides = new Map<string, Price>([['does-not-exist', makeOverride(200)]])
    const { overridesPreserved, selections } = buildRows(slate, overrides, DEFAULT_MARGIN, NOW)
    expect(overridesPreserved).toBe(0)
    expect(selections.every((s) => s.override === false)).toBe(true)
  })
})

/** A fake OddsCache that records every call + the rows it was handed, in order. */
class FakeCache implements OddsCache {
  calls: string[] = []
  events: OddsEventRow[] = []
  markets: OddsMarketRow[] = []
  selections: OddsSelectionRow[] = []
  constructor(private readonly overrides: Map<string, Price> = new Map()) {}

  async getOverrides(eventIds: string[]): Promise<Map<string, Price>> {
    this.calls.push(`getOverrides(${eventIds.length})`)
    return this.overrides
  }
  async writeEvents(rows: OddsEventRow[]): Promise<void> {
    this.calls.push('writeEvents')
    this.events = rows
  }
  async writeMarkets(rows: OddsMarketRow[]): Promise<void> {
    this.calls.push('writeMarkets')
    this.markets = rows
  }
  async writeSelections(rows: OddsSelectionRow[]): Promise<void> {
    this.calls.push('writeSelections')
    this.selections = rows
  }
}

describe('Poller.pollOnce — drives provider → cache', () => {
  it('reads overrides then writes parents before children and returns correct counts', async () => {
    const provider = new MockProvider() // default MOCK_EVENTS
    const cache = new FakeCache()
    const poller = new Poller({ provider, cache, now: () => NOW })

    const result = await poller.pollOnce()

    // call order: overrides BEFORE writes; events → markets → selections (FK parents first)
    expect(cache.calls).toEqual([
      'getOverrides(' + MOCK_EVENTS.length + ')',
      'writeEvents',
      'writeMarkets',
      'writeSelections',
    ])

    // counts match the flattened slate
    const expectedMarkets = MOCK_EVENTS.reduce((n, e) => n + e.markets.length, 0)
    const expectedSelections = MOCK_EVENTS.reduce(
      (n, e) => n + e.markets.reduce((mn, m) => mn + m.selections.length, 0),
      0,
    )
    expect(result.events).toBe(MOCK_EVENTS.length)
    expect(result.markets).toBe(expectedMarkets)
    expect(result.selections).toBe(expectedSelections)
    expect(result.overridesPreserved).toBe(0)

    // counts agree with what was actually written
    expect(cache.events).toHaveLength(result.events)
    expect(cache.markets).toHaveLength(result.markets)
    expect(cache.selections).toHaveLength(result.selections)
    // every written row stamped with the injected now
    expect(cache.events.every((r) => r.updated_at === NOW)).toBe(true)
  })

  it('an override returned by the cache survives into the written selection rows', async () => {
    const provider = new MockProvider()
    // Override the LIVE NBA moneyline-home selection (raw -135) to a hand-set +150.
    const selId = 'mock-nba-lal-bos-ml-home'
    const override = makeOverride(150)
    const cache = new FakeCache(new Map([[selId, override]]))
    const poller = new Poller({ provider, cache, now: () => NOW })

    const result = await poller.pollOnce()

    expect(result.overridesPreserved).toBe(1)

    const written = cache.selections.find((s) => s.selection_id === selId)!
    expect(written.override).toBe(true)
    expect(written.price_display_american).toBe(override.american)
    expect(written.price_display_decimal).toBe(override.decimal)

    // raw still reflects the feed (-135), proving the override didn't clobber the trader reference
    const rawFeed = priceFromAmerican(-135)
    expect(written.price_raw_american).toBe(rawFeed.american)
    expect(written.price_raw_decimal).toBe(rawFeed.decimal)
  })

  it('honors the configured leagues filter (passes leagues to the provider)', async () => {
    const provider = new MockProvider()
    const cache = new FakeCache()
    const poller = new Poller({ provider, cache, leagues: ['NFL'], now: () => NOW })

    const result = await poller.pollOnce()

    // MOCK_EVENTS has exactly one NFL event (KC/BUF)
    expect(result.events).toBe(1)
    expect(cache.events[0].league_id).toBe('NFL')
  })

  it('writes nothing-but-still-calls in order for an empty slate', async () => {
    const provider = new MockProvider([]) // empty seed
    const cache = new FakeCache()
    const poller = new Poller({ provider, cache, now: () => NOW })

    const result = await poller.pollOnce()
    expect(result).toEqual({ events: 0, markets: 0, selections: 0, overridesPreserved: 0 })
    expect(cache.calls).toEqual(['getOverrides(0)', 'writeEvents', 'writeMarkets', 'writeSelections'])
  })
})

describe('selectProvider — default is the mock', () => {
  it('returns a MockProvider (name === "mock") when SGO_LIVE is unset', () => {
    const prior = process.env.SGO_LIVE
    delete process.env.SGO_LIVE
    try {
      const provider = selectProvider()
      expect(provider.name).toBe('mock')
      expect(provider).toBeInstanceOf(MockProvider)
    } finally {
      if (prior !== undefined) process.env.SGO_LIVE = prior
    }
  })

  it('also defaults to mock when SGO_LIVE is explicitly off', () => {
    const prior = process.env.SGO_LIVE
    process.env.SGO_LIVE = '0'
    try {
      expect(selectProvider().name).toBe('mock')
    } finally {
      if (prior === undefined) delete process.env.SGO_LIVE
      else process.env.SGO_LIVE = prior
    }
  })
})

describe('ACTIVE_LEAGUES default scope', () => {
  it('covers the Big 6 + UFC and is the Poller default', async () => {
    expect(ACTIVE_LEAGUES).toContain('UFC')
    expect(ACTIVE_LEAGUES).toContain('NFL')
    // Default poller (no leagues override) should pull the whole mock slate.
    const cache = new FakeCache()
    const poller = new Poller({ provider: new MockProvider(), cache, now: () => NOW })
    const result = await poller.pollOnce()
    expect(result.events).toBe(MOCK_EVENTS.length)
  })
})
