/**
 * The same-game bet-builder MODEL — pure. It's a UX layer over the existing engine, so the
 * tests prove it: groups one game's markets, prices the running ticket through the SGP
 * correlation path (combinedDecimal), and reports each pick's state through the CANONICAL
 * validateSlip block matrix (added / available / blocked-with-reason / off-board). No money.
 */
import { describe, it, expect } from 'vitest'
import type { NormalizedEvent, NormalizedMarket, Price, Selection } from '../../lib/odds/contract.js'
import { legFromSelection, parlayPrice } from './slip.js'
import { toReturnCents } from './odds-format.js'
import {
  builderGroups,
  builderQuote,
  legsOffBoard,
  selectionAvailability,
  toggleBuilderLeg,
} from './builder.js'

const P = (american: number, decimal: number): Price => ({ american, decimal })
function sel(
  selectionId: string,
  side: string,
  line: number | undefined,
  am: number,
  dec: number,
  available = true,
): Selection {
  return {
    selectionId,
    side,
    ...(line === undefined ? {} : { line }),
    priceRaw: P(am, dec),
    priceDisplay: P(am, dec),
    bookmaker: 'mock',
    available,
  }
}
function mkt(
  marketId: string,
  type: NormalizedMarket['type'],
  selections: Selection[],
  extra: Partial<NormalizedMarket> = {},
): NormalizedMarket {
  return { marketId, type, period: 'game', selections, ...extra }
}

/** A basketball game: moneyline, total (220.5), and two alt player-prop lines for one player. */
function mkEvent(): NormalizedEvent {
  return {
    eventId: 'ev1',
    leagueId: 'NBA',
    sport: 'BASKETBALL',
    home: 'Lakers',
    away: 'Celtics',
    startsAt: '2026-07-01T00:00:00Z',
    status: 'pre',
    markets: [
      mkt('ev1:moneyline:game', 'moneyline', [
        sel('ml-home', 'home', undefined, -130, 1.77),
        sel('ml-away', 'away', undefined, 110, 2.1),
      ]),
      mkt('ev1:total:game', 'total', [
        sel('tot-over', 'over', 220.5, -110, 1.91),
        sel('tot-under', 'under', 220.5, -110, 1.91),
      ]),
      mkt('ev1:total:alt', 'total', [
        sel('alt-over', 'over', 230.5, 140, 2.4),
        sel('alt-under', 'under', 230.5, -170, 1.59),
      ]),
      mkt(
        'ev1:prop:points:lebron:27',
        'prop',
        [sel('pp-over', 'over', 27.5, -115, 1.87), sel('pp-under', 'under', 27.5, -105, 1.95)],
        { statId: 'points', playerId: 'lebron' },
      ),
      mkt(
        'ev1:prop:points:lebron:24',
        'prop',
        [sel('pp2-over', 'over', 24.5, -200, 1.5), sel('pp2-under', 'under', 24.5, 165, 2.65)],
        { statId: 'points', playerId: 'lebron' },
      ),
    ],
  }
}

const EV = mkEvent()
const marketOf = (id: string) => EV.markets.find((m) => m.marketId === id)!
const selOf = (marketId: string, selId: string) =>
  marketOf(marketId).selections.find((s) => s.selectionId === selId)!
const legOf = (marketId: string, selId: string) =>
  legFromSelection(EV, marketOf(marketId), selOf(marketId, selId))

describe('builderGroups — one game laid out for building', () => {
  it('orders game lines first (main then alternate), then a block per player prop', () => {
    const groups = builderGroups(EV)
    expect(groups.map((g) => g.kind)).toEqual(['game', 'game', 'game', 'prop', 'prop'])
    expect(groups.map((g) => g.title)).toEqual([
      'Moneyline',
      'Total',
      'Alternate Total',
      'lebron — Points',
      'lebron — Points',
    ])
  })
})

describe('selectionAvailability — guided block messaging', () => {
  it('an empty builder makes every pick available; an added pick reads "added"', () => {
    expect(selectionAvailability([], EV, marketOf('ev1:moneyline:game'), selOf('ev1:moneyline:game', 'ml-home')).state).toBe('available')
    const legs = [legOf('ev1:moneyline:game', 'ml-home')]
    expect(selectionAvailability(legs, EV, marketOf('ev1:moneyline:game'), selOf('ev1:moneyline:game', 'ml-home')).state).toBe('added')
  })

  it('a cross-market same-game pick stays available (it correlates, not conflicts)', () => {
    const legs = [legOf('ev1:moneyline:game', 'ml-home')]
    expect(selectionAvailability(legs, EV, marketOf('ev1:total:game'), selOf('ev1:total:game', 'tot-over')).state).toBe('available')
  })

  it('the opposing side of a chosen total is BLOCKED with the matrix message', () => {
    const legs = [legOf('ev1:total:game', 'tot-over')]
    const a = selectionAvailability(legs, EV, marketOf('ev1:total:game'), selOf('ev1:total:game', 'tot-under'))
    expect(a.state).toBe('blocked')
    if (a.state === 'blocked') {
      expect(a.reason).toBe('opposing_total')
      expect(a.message).toMatch(/Over and Under/i)
    }
  })

  it('a nested prop line (same player/stat/side, different line) is BLOCKED', () => {
    const legs = [legOf('ev1:prop:points:lebron:27', 'pp-over')]
    const a = selectionAvailability(legs, EV, marketOf('ev1:prop:points:lebron:24'), selOf('ev1:prop:points:lebron:24', 'pp2-over'))
    expect(a.state).toBe('blocked')
    if (a.state === 'blocked') expect(a.reason).toBe('nested_prop')
  })

  it('a pulled price is off-board; an injected suspension also marks it off-board', () => {
    const pulled = mkt('ev1:x', 'moneyline', [sel('x', 'home', undefined, -130, 1.77, false)])
    expect(selectionAvailability([], EV, pulled, pulled.selections[0]).state).toBe('off-board')
    // desk suspension (injected) → can't be built, matching the placement gate
    expect(
      selectionAvailability([], EV, marketOf('ev1:moneyline:game'), selOf('ev1:moneyline:game', 'ml-home'), () => true).state,
    ).toBe('off-board')
  })
})

describe('builderQuote — prices through the SGP correlation engine', () => {
  it('an empty ticket is not placeable', () => {
    const q = builderQuote([], 5_000)
    expect(q.ok).toBe(false)
    expect(q.decimal).toBe(1)
    expect(q.sgp).toBe(false)
    expect(q.toReturnCents).toBe(0)
  })

  it('a single leg prices at its own decimal (not an SGP)', () => {
    const leg = legOf('ev1:moneyline:game', 'ml-home')
    const q = builderQuote([leg], 10_000)
    expect(q.ok).toBe(true)
    expect(q.sgp).toBe(false)
    expect(q.decimal).toBe(leg.price.decimal)
    expect(q.toReturnCents).toBe(toReturnCents(10_000, leg.price.decimal))
  })

  it('two same-game legs price as a correlated SGP, no longer than the independent product', () => {
    const legs = [legOf('ev1:moneyline:game', 'ml-home'), legOf('ev1:total:game', 'tot-over')]
    const q = builderQuote(legs, 5_000)
    expect(q.ok).toBe(true)
    expect(q.sgp).toBe(true)
    expect(q.decimal).toBeGreaterThan(1)
    expect(q.decimal).toBeLessThanOrEqual(parlayPrice(legs) + 1e-3)
    expect(q.profitCents).toBeGreaterThan(0)
  })

  it('contradictory legs make the ticket un-placeable and surface a block message', () => {
    const legs = [legOf('ev1:total:game', 'tot-over'), legOf('ev1:total:game', 'tot-under')]
    const q = builderQuote(legs, 5_000)
    expect(q.ok).toBe(false)
    expect(q.blockMessage).toBeTruthy()
    expect(new Set(q.conflictKeys)).toEqual(new Set(['tot-over', 'tot-under']))
  })
})

describe('legsOffBoard — live drift since add time', () => {
  it('flags a leg whose selection was pulled, or whose market the desk suspended', () => {
    const liveLeg = legOf('ev1:moneyline:game', 'ml-home')
    expect(legsOffBoard([liveLeg], EV)).toEqual([]) // on the board → clean
    // its selection is pulled (available false) on the live event
    const pulled: NormalizedEvent = {
      ...EV,
      markets: EV.markets.map((m) =>
        m.marketId === 'ev1:moneyline:game'
          ? { ...m, selections: m.selections.map((s) => ({ ...s, available: false })) }
          : m,
      ),
    }
    expect(legsOffBoard([liveLeg], pulled)).toEqual(['ml-home'])
    // an injected suspension also marks it off-board (mirrors the placement gate)
    expect(legsOffBoard([liveLeg], EV, () => true)).toEqual(['ml-home'])
  })
})

describe('toggleBuilderLeg — add then remove', () => {
  it('adds a leg, then removes it on a second toggle', () => {
    const m = marketOf('ev1:moneyline:game')
    const s = selOf('ev1:moneyline:game', 'ml-home')
    const added = toggleBuilderLeg([], EV, m, s)
    expect(added.map((l) => l.key)).toEqual(['ml-home'])
    expect(toggleBuilderLeg(added, EV, m, s)).toHaveLength(0)
  })
})
