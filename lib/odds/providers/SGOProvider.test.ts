/**
 * SGOProvider — unit tests for the SGO odds DATA lane.
 *
 * Covers (in order of importance):
 *  - the PURE helpers: parseOddId / marketTypeOf / statusOf
 *  - normalizeEvent on a hand-built SGOEvent (moneyline / spread / total / player-prop)
 *  - SGOProvider.listEvents with an injected fetchImpl (envelope + cursor paging + header)
 *
 * Odds only — no money/credit is asserted anywhere (this lane carries prices, not stakes).
 */

import { describe, it, expect } from 'vitest'
import {
  parseOddId,
  marketTypeOf,
  statusOf,
  normalizeEvent,
  SGOProvider,
} from './SGOProvider.js'
import { priceFromAmerican, applyMargin } from '../pricing.js'
import type { NormalizedEvent } from '../contract.js'

/* ───────────────────────── pure: parseOddId ───────────────────────── */

describe('parseOddId', () => {
  it('splits a 5-part oddID into its named segments', () => {
    expect(parseOddId('points-home-game-ml-home')).toEqual({
      statID: 'points',
      statEntityID: 'home',
      periodID: 'game',
      betTypeID: 'ml',
      sideID: 'home',
    })
  })

  it('parses a spread oddID', () => {
    expect(parseOddId('points-away-game-sp-away')).toEqual({
      statID: 'points',
      statEntityID: 'away',
      periodID: 'game',
      betTypeID: 'sp',
      sideID: 'away',
    })
  })

  it('returns null when there are fewer than 5 parts', () => {
    expect(parseOddId('points-home-game-ml')).toBeNull()
    expect(parseOddId('points')).toBeNull()
    expect(parseOddId('')).toBeNull()
  })

  it('returns null when there are more than 5 parts', () => {
    expect(parseOddId('points-home-game-ml-home-extra')).toBeNull()
  })
})

/* ───────────────────────── pure: marketTypeOf ───────────────────────── */

describe('marketTypeOf', () => {
  it('maps the three core betTypeIDs', () => {
    expect(marketTypeOf('ml', false)).toBe('moneyline')
    expect(marketTypeOf('sp', false)).toBe('spread')
    expect(marketTypeOf('ou', false)).toBe('total')
  })

  it('maps any non-core betTypeID to prop, with or without a player', () => {
    expect(marketTypeOf('yn', false)).toBe('prop')
    expect(marketTypeOf('eo', true)).toBe('prop')
    expect(marketTypeOf('', false)).toBe('prop')
  })
})

/* ───────────────────────── pure: statusOf ───────────────────────── */

describe('statusOf', () => {
  it('returns pre when status is undefined', () => {
    expect(statusOf(undefined)).toBe('pre')
  })

  it('returns pre for an empty / not-yet-started status', () => {
    expect(statusOf({})).toBe('pre')
    expect(statusOf({ started: false, live: false })).toBe('pre')
  })

  it('returns ended for ended / finalized / cancelled (and completed)', () => {
    expect(statusOf({ ended: true })).toBe('ended')
    expect(statusOf({ finalized: true })).toBe('ended')
    expect(statusOf({ cancelled: true })).toBe('ended')
    expect(statusOf({ completed: true })).toBe('ended')
  })

  it('returns live for live / started', () => {
    expect(statusOf({ live: true })).toBe('live')
    expect(statusOf({ started: true })).toBe('live')
  })

  it('prefers ended over live when both are set (game finished)', () => {
    expect(statusOf({ started: true, live: true, ended: true })).toBe('ended')
  })
})

/* ───────────────────────── normalizeEvent ───────────────────────── */

/** A hand-built SGO event with moneyline + spread + total team markets and one player
 *  prop, modelled on the SGOEvent interface in the impl. */
function buildEvent() {
  return {
    eventID: 'evt-1',
    sportID: 'BASKETBALL',
    leagueID: 'NBA',
    status: {
      startsAt: '2026-06-20T23:00:00Z',
      started: false,
      live: false,
      ended: false,
    },
    teams: {
      home: { names: { short: 'BOS', medium: 'Celtics', long: 'Boston Celtics' }, teamID: 'BOS' },
      away: { names: { short: 'LAL', medium: 'Lakers', long: 'Los Angeles Lakers' }, teamID: 'LAL' },
    },
    odds: {
      // moneyline — two sides
      'points-home-game-ml-home': {
        oddID: 'points-home-game-ml-home',
        byBookmaker: {
          draftkings: { odds: '-135', available: true, isMainLine: true },
        },
      },
      'points-away-game-ml-away': {
        oddID: 'points-away-game-ml-away',
        byBookmaker: {
          draftkings: { odds: '+150', available: true, isMainLine: true },
        },
      },
      // spread — two sides carrying a handicap line
      'points-home-game-sp-home': {
        oddID: 'points-home-game-sp-home',
        byBookmaker: {
          draftkings: { odds: '-110', spread: '-3.5', available: true, isMainLine: true },
        },
      },
      'points-away-game-sp-away': {
        oddID: 'points-away-game-sp-away',
        byBookmaker: {
          draftkings: { odds: '-110', spread: '+3.5', available: true, isMainLine: true },
        },
      },
      // total — over/under carrying the total line
      'points-all-game-ou-over': {
        oddID: 'points-all-game-ou-over',
        byBookmaker: {
          draftkings: { odds: '-110', overUnder: '224.5', available: true, isMainLine: true },
        },
      },
      'points-all-game-ou-under': {
        oddID: 'points-all-game-ou-under',
        byBookmaker: {
          draftkings: { odds: '-110', overUnder: '224.5', available: true, isMainLine: true },
        },
      },
      // player prop — points, carries a playerID + a non-core betType (props use a
      // stat-specific betType, not the core ml/sp/ou; marketTypeOf maps it to 'prop')
      'points-PLAYER123-game-pt-over': {
        oddID: 'points-PLAYER123-game-pt-over',
        betTypeID: 'pt',
        playerID: 'PLAYER123',
        byBookmaker: {
          draftkings: { odds: '+150', overUnder: '27.5', available: true, isMainLine: true },
        },
      },
    },
  }
}

describe('normalizeEvent', () => {
  const ev = normalizeEvent(buildEvent())

  it('carries the event-level fields (teams use the medium name, status derived)', () => {
    expect(ev.eventId).toBe('evt-1')
    expect(ev.leagueId).toBe('NBA')
    expect(ev.sport).toBe('BASKETBALL')
    expect(ev.home).toBe('Celtics')
    expect(ev.away).toBe('Lakers')
    expect(ev.startsAt).toBe('2026-06-20T23:00:00Z')
    expect(ev.status).toBe('pre')
  })

  it('groups odds into moneyline + spread + total + prop markets', () => {
    const types = ev.markets.map((m) => m.type).sort()
    expect(types).toEqual(['moneyline', 'prop', 'spread', 'total'])
  })

  const ml = ev.markets.find((m) => m.type === 'moneyline')!
  const sp = ev.markets.find((m) => m.type === 'spread')!
  const tot = ev.markets.find((m) => m.type === 'total')!
  const prop = ev.markets.find((m) => m.type === 'prop')!

  it('groups both moneyline sides into one market with no line', () => {
    expect(ml.selections).toHaveLength(2)
    expect(ml.period).toBe('game')
    const sides = ml.selections.map((s) => s.side).sort()
    expect(sides).toEqual(['away', 'home'])
    for (const s of ml.selections) expect(s.line).toBeUndefined()
  })

  it('sources the moneyline price from the preferred bookmaker and margins the display', () => {
    const homeMl = ml.selections.find((s) => s.side === 'home')!
    expect(homeMl.bookmaker).toBe('draftkings')
    expect(homeMl.available).toBe(true)
    // -135 → raw decimal 1.7407, display after 4.5% margin → american -141 / decimal 1.7074
    expect(homeMl.priceRaw).toEqual(priceFromAmerican(-135))
    expect(homeMl.priceRaw.american).toBe(-135)
    expect(homeMl.priceDisplay).toEqual(applyMargin(priceFromAmerican(-135)))
    expect(homeMl.priceDisplay.american).toBe(-141)

    const awayMl = ml.selections.find((s) => s.side === 'away')!
    expect(awayMl.priceRaw).toEqual(priceFromAmerican(150))
    expect(awayMl.priceDisplay).toEqual(applyMargin(priceFromAmerican(150)))
  })

  it('reads the spread handicap into Selection.line (from the bookmaker spread)', () => {
    expect(sp.selections).toHaveLength(2)
    const homeSp = sp.selections.find((s) => s.side === 'home')!
    const awaySp = sp.selections.find((s) => s.side === 'away')!
    expect(homeSp.line).toBe(-3.5)
    expect(awaySp.line).toBe(3.5)
    expect(homeSp.priceRaw).toEqual(priceFromAmerican(-110))
    // selectionId for an alt/line selection embeds the line
    expect(homeSp.selectionId).toBe('points-home-game-sp-home@-3.5')
  })

  it('reads the total line into Selection.line (from overUnder) for over and under', () => {
    expect(tot.selections).toHaveLength(2)
    for (const s of tot.selections) expect(s.line).toBe(224.5)
    const sides = tot.selections.map((s) => s.side).sort()
    expect(sides).toEqual(['over', 'under'])
    expect(tot.statId).toBeUndefined() // team total: not a prop, no statId surfaced
    expect(tot.playerId).toBeUndefined()
  })

  it('maps a player oddID to a prop market carrying statId + playerId', () => {
    expect(prop.type).toBe('prop')
    expect(prop.statId).toBe('points')
    expect(prop.playerId).toBe('PLAYER123')
    expect(prop.selections).toHaveLength(1)
    const sel = prop.selections[0]
    expect(sel.side).toBe('over')
    // line is only surfaced for spread (spread) / total (overUnder); a prop carries none
    expect(sel.line).toBeUndefined()
    expect(sel.bookmaker).toBe('draftkings')
    expect(sel.priceRaw).toEqual(priceFromAmerican(150))
    expect(sel.priceDisplay).toEqual(applyMargin(priceFromAmerican(150)))
  })

  it('builds stable marketIds (props embed stat + player, team markets do not)', () => {
    expect(ml.marketId).toBe('evt-1:moneyline:game')
    expect(sp.marketId).toBe('evt-1:spread:game')
    expect(tot.marketId).toBe('evt-1:total:game')
    expect(prop.marketId).toBe('evt-1:prop:game:points:PLAYER123')
  })

  it('respects a custom preferred-bookmaker order and a custom margin', () => {
    const base = buildEvent()
    // add a second book that should win when fanduel is preferred first
    const homeMlOdd = base.odds['points-home-game-ml-home'] as {
      byBookmaker: Record<string, { odds: string; available: boolean; isMainLine: boolean }>
    }
    homeMlOdd.byBookmaker = {
      draftkings: { odds: '-135', available: true, isMainLine: true },
      fanduel: { odds: '-130', available: true, isMainLine: false },
    }
    const out = normalizeEvent(base, { bookmakers: ['fanduel', 'draftkings'], margin: 0 })
    const homeMl = out.markets
      .find((m) => m.type === 'moneyline')!
      .selections.find((s) => s.side === 'home')!
    expect(homeMl.bookmaker).toBe('fanduel')
    expect(homeMl.priceRaw.american).toBe(-130)
    // margin 0 → display equals raw
    expect(homeMl.priceDisplay).toEqual(homeMl.priceRaw)
  })

  it('falls back to Home/Away when team names are missing', () => {
    const bare = { eventID: 'e', odds: {} }
    const out = normalizeEvent(bare)
    expect(out.home).toBe('Home')
    expect(out.away).toBe('Away')
    expect(out.markets).toEqual([])
    expect(out.leagueId).toBe('')
    expect(out.startsAt).toBe('')
  })

  it('skips malformed oddIDs and odds with no usable bookmaker price', () => {
    const e = {
      eventID: 'e2',
      teams: { home: { names: { medium: 'H' } }, away: { names: { medium: 'A' } } },
      odds: {
        // not 5 parts → skipped
        'bad-odd-id': { oddID: 'bad-odd-id', byBookmaker: { draftkings: { odds: '-110' } } },
        // no parseable price → skipped
        'points-home-game-ml-home': {
          oddID: 'points-home-game-ml-home',
          byBookmaker: { draftkings: { odds: 'NaN', available: true } },
        },
      },
    }
    const out = normalizeEvent(e)
    expect(out.markets).toEqual([])
  })

  it('marks a selection unavailable when the book has pulled it', () => {
    const e = {
      eventID: 'e3',
      teams: { home: { names: { medium: 'H' } }, away: { names: { medium: 'A' } } },
      odds: {
        'points-home-game-ml-home': {
          oddID: 'points-home-game-ml-home',
          bookOddsAvailable: false,
          byBookmaker: { draftkings: { odds: '-110', available: true, isMainLine: true } },
        },
      },
    }
    const out = normalizeEvent(e)
    const sel = out.markets[0].selections[0]
    expect(sel.available).toBe(false)
  })
})

/* ───────────────────────── SGOProvider.listEvents ───────────────────────── */

/** Build a minimal fetch double that returns the given JSON envelope and records calls. */
function fakeFetch(pages: Array<{ data: unknown[]; nextCursor: string | null }>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  let i = 0
  const impl = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> })
    const body = pages[Math.min(i, pages.length - 1)]
    i++
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ success: true, ...body }),
    }
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('SGOProvider.listEvents', () => {
  it('normalizes a single-page envelope, sends the x-api-key header and oddsAvailable=true', async () => {
    const { impl, calls } = fakeFetch([{ data: [buildEvent()], nextCursor: null }])
    const provider = new SGOProvider({ apiKey: 'test-key', fetchImpl: impl })

    const out: NormalizedEvent[] = await provider.listEvents(['NBA'])

    expect(out).toHaveLength(1)
    expect(out[0].eventId).toBe('evt-1')
    expect(out[0].markets.map((m) => m.type).sort()).toEqual(['moneyline', 'prop', 'spread', 'total'])

    // exactly one request (no next cursor)
    expect(calls).toHaveLength(1)
    expect(calls[0].headers['x-api-key']).toBe('test-key')
    expect(calls[0].url).toContain('oddsAvailable=true')
    expect(calls[0].url).toContain('leagueID=NBA')
  })

  it('reports configured() based on the presence of an api key', () => {
    expect(new SGOProvider({ apiKey: 'k', fetchImpl: fakeFetch([]).impl }).configured).toBe(true)
    expect(new SGOProvider({ apiKey: '', fetchImpl: fakeFetch([]).impl }).configured).toBe(false)
    expect(new SGOProvider({ fetchImpl: fakeFetch([]).impl }).configured).toBe(false)
  })

  it('follows the cursor across two pages and concatenates the results', async () => {
    const p1 = { eventID: 'evt-a', teams: { home: { names: { medium: 'H1' } }, away: { names: { medium: 'A1' } } }, odds: {} }
    const p2 = { eventID: 'evt-b', teams: { home: { names: { medium: 'H2' } }, away: { names: { medium: 'A2' } } }, odds: {} }
    const { impl, calls } = fakeFetch([
      { data: [p1], nextCursor: 'CURSOR_2' },
      { data: [p2], nextCursor: null },
    ])
    const provider = new SGOProvider({ apiKey: 'test-key', fetchImpl: impl })

    const out = await provider.listEvents(['NBA', 'NFL'])

    expect(out.map((e) => e.eventId)).toEqual(['evt-a', 'evt-b'])
    expect(calls).toHaveLength(2)
    // first page has no cursor param; second page carries the cursor returned by page 1
    expect(calls[0].url).not.toContain('cursor=')
    expect(calls[1].url).toContain('cursor=CURSOR_2')
    // multi-league join
    expect(calls[0].url).toContain('leagueID=NBA%2CNFL')
  })

  it('passes optional filters through to the query string', async () => {
    const { impl, calls } = fakeFetch([{ data: [], nextCursor: null }])
    const provider = new SGOProvider({ apiKey: 'test-key', fetchImpl: impl })

    await provider.listEvents(['NBA'], {
      includeAltLines: true,
      bookmakerIds: ['draftkings', 'fanduel'],
      status: 'live',
      limit: 5,
    })

    const url = calls[0].url
    expect(url).toContain('includeAltLines=true')
    expect(url).toContain('bookmakerID=draftkings%2Cfanduel')
    expect(url).toContain('live=true')
    expect(url).toContain('limit=5')
  })

  it('throws when the HTTP response is not ok', async () => {
    const impl = (async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({}),
    })) as unknown as typeof fetch
    const provider = new SGOProvider({ apiKey: 'test-key', fetchImpl: impl })
    await expect(provider.listEvents(['NBA'])).rejects.toThrow(/429/)
  })

  it('throws when the envelope reports success:false', async () => {
    const impl = (async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ success: false, data: [] }),
    })) as unknown as typeof fetch
    const provider = new SGOProvider({ apiKey: 'test-key', fetchImpl: impl })
    await expect(provider.listEvents(['NBA'])).rejects.toThrow(/success:false/)
  })
})
