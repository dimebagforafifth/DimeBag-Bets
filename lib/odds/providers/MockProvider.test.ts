/**
 * MockProvider — unit tests for the seeded offline odds slate.
 *
 * Covers:
 *  - MOCK_EVENTS coverage: Big 6 leagues (NFL/NBA/MLB/NHL/EPL/NCAAF) + UFC, ≥1 live event,
 *    every event has moneyline+spread+total markets, the live NBA event has a prop market.
 *  - listEvents filtering (league, status, limit) + clone isolation (mutation safety).
 *  - getEvent clone/null behaviour.
 *  - every selection carries finite priceRaw + priceDisplay (american + decimal), with the
 *    display price being the margined (shorter net payout) version of the raw price.
 *
 * Odds only — no money/credit is asserted anywhere (this lane carries prices, not stakes).
 */

import { describe, it, expect } from 'vitest'
import { MockProvider, MOCK_EVENTS } from './MockProvider.js'
import type { NormalizedEvent, NormalizedMarket, Selection } from '../contract.js'

const BIG_SIX = ['NFL', 'NBA', 'MLB', 'NHL', 'EPL', 'NCAAF']

function marketTypes(ev: NormalizedEvent): string[] {
  return ev.markets.map((m) => m.type)
}

function allSelections(events: NormalizedEvent[]): Selection[] {
  return events.flatMap((e) => e.markets.flatMap((m) => m.selections))
}

/* ───────────────────────── MOCK_EVENTS coverage ───────────────────────── */

describe('MOCK_EVENTS league coverage', () => {
  it('includes all Big 6 leagues plus UFC', () => {
    const leagues = MOCK_EVENTS.map((e) => e.leagueId)
    for (const lg of [...BIG_SIX, 'UFC']) {
      expect(leagues).toContain(lg)
    }
  })

  it('has at least one live event', () => {
    const live = MOCK_EVENTS.filter((e) => e.status === 'live')
    expect(live.length).toBeGreaterThanOrEqual(1)
  })

  it('every event has moneyline + spread + total markets', () => {
    for (const ev of MOCK_EVENTS) {
      const types = marketTypes(ev)
      expect(types, `event ${ev.eventId}`).toContain('moneyline')
      expect(types, `event ${ev.eventId}`).toContain('spread')
      expect(types, `event ${ev.eventId}`).toContain('total')
    }
  })

  it('the live NBA event has a prop market with statId + playerId', () => {
    const nbaLive = MOCK_EVENTS.find((e) => e.leagueId === 'NBA' && e.status === 'live')
    expect(nbaLive, 'expected a live NBA event').toBeDefined()
    const prop = nbaLive!.markets.find((m) => m.type === 'prop')
    expect(prop, 'expected a prop market on the live NBA event').toBeDefined()
    expect(typeof prop!.statId).toBe('string')
    expect(prop!.statId!.length).toBeGreaterThan(0)
    expect(typeof prop!.playerId).toBe('string')
    expect(prop!.playerId!.length).toBeGreaterThan(0)
  })

  it('every event has a well-formed shape (ids, teams, ISO start, status)', () => {
    for (const ev of MOCK_EVENTS) {
      expect(ev.eventId.length).toBeGreaterThan(0)
      expect(ev.leagueId.length).toBeGreaterThan(0)
      expect(ev.sport.length).toBeGreaterThan(0)
      expect(ev.home.length).toBeGreaterThan(0)
      expect(ev.away.length).toBeGreaterThan(0)
      expect(['pre', 'live', 'ended']).toContain(ev.status)
      // startsAt parses to a real date.
      expect(Number.isNaN(Date.parse(ev.startsAt))).toBe(false)
    }
  })

  it('every selection has finite priceRaw + priceDisplay (american + decimal)', () => {
    for (const sel of allSelections(MOCK_EVENTS)) {
      for (const p of [sel.priceRaw, sel.priceDisplay]) {
        expect(Number.isFinite(p.american), sel.selectionId).toBe(true)
        expect(Number.isFinite(p.decimal), sel.selectionId).toBe(true)
        // decimal is a real payout multiplier (> 1 for any live price).
        expect(p.decimal).toBeGreaterThan(1)
      }
    }
  })

  it('priceDisplay is the margined raw price (shorter net payout on every selection)', () => {
    const sels = allSelections(MOCK_EVENTS)
    expect(sels.length).toBeGreaterThan(0)
    let positiveEdgeSeen = 0
    for (const sel of sels) {
      // Net winnings = decimal - 1. Margin (4.5%) haircuts the net, so display pays strictly
      // less than raw whenever there is any net to cut (raw decimal > 1, which always holds).
      expect(
        sel.priceDisplay.decimal,
        `${sel.selectionId}: display ${sel.priceDisplay.decimal} should be < raw ${sel.priceRaw.decimal}`,
      ).toBeLessThan(sel.priceRaw.decimal)
      // Net winnings are still positive (display never drops to/below even money here).
      expect(sel.priceDisplay.decimal).toBeGreaterThan(1)
      if (sel.priceDisplay.decimal < sel.priceRaw.decimal) positiveEdgeSeen++
    }
    // "at least one selection" with a positive-edge (shorter) display price — here, all.
    expect(positiveEdgeSeen).toBeGreaterThanOrEqual(1)
  })

  it('selections with a line carry the line number; moneyline selections do not', () => {
    for (const ev of MOCK_EVENTS) {
      for (const m of ev.markets) {
        for (const sel of m.selections) {
          if (m.type === 'moneyline') {
            expect(sel.line, `${sel.selectionId}`).toBeUndefined()
          } else {
            expect(typeof sel.line, `${sel.selectionId}`).toBe('number')
            expect(Number.isFinite(sel.line!)).toBe(true)
          }
        }
      }
    }
  })
})

/* ───────────────────────── listEvents ───────────────────────── */

describe('MockProvider.listEvents', () => {
  it('listEvents([]) returns all seeded events', async () => {
    const p = new MockProvider()
    const out = await p.listEvents([])
    expect(out.length).toBe(MOCK_EVENTS.length)
    expect(out.map((e) => e.eventId).sort()).toEqual(MOCK_EVENTS.map((e) => e.eventId).sort())
  })

  it('returns clones — mutating a returned price does NOT affect a second call', async () => {
    const p = new MockProvider()
    const first = await p.listEvents([])
    const target = first[0].markets[0].selections[0]
    const originalAmerican = target.priceDisplay.american
    // Corrupt the returned data.
    target.priceDisplay.american = 99999
    target.priceRaw.decimal = -1
    target.available = false
    first[0].markets[0].selections.push({ ...target, selectionId: 'injected' })

    const second = await p.listEvents([])
    const sameSel = second[0].markets[0].selections[0]
    expect(sameSel.priceDisplay.american).toBe(originalAmerican)
    expect(sameSel.priceRaw.decimal).not.toBe(-1)
    expect(sameSel.available).toBe(true)
    // The pushed selection did not leak into the seed.
    expect(second[0].markets[0].selections.some((s) => s.selectionId === 'injected')).toBe(false)
  })

  it("listEvents(['NBA']) filters by league", async () => {
    const p = new MockProvider()
    const out = await p.listEvents(['NBA'])
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect(out.every((e) => e.leagueId === 'NBA')).toBe(true)
  })

  it('listEvents with multiple leagues returns the union', async () => {
    const p = new MockProvider()
    const out = await p.listEvents(['NFL', 'EPL'])
    const leagues = new Set(out.map((e) => e.leagueId))
    expect(leagues).toEqual(new Set(['NFL', 'EPL']))
  })

  it('listEvents with an unknown league returns nothing', async () => {
    const p = new MockProvider()
    const out = await p.listEvents(['DOES_NOT_EXIST'])
    expect(out).toEqual([])
  })

  it('listEvents([], {status:"live"}) filters by status', async () => {
    const p = new MockProvider()
    const out = await p.listEvents([], { status: 'live' })
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect(out.every((e) => e.status === 'live')).toBe(true)
  })

  it('listEvents([], {limit:2}) caps the result', async () => {
    const p = new MockProvider()
    const out = await p.listEvents([], { limit: 2 })
    expect(out.length).toBe(2)
  })

  it('combines league + status filters', async () => {
    const p = new MockProvider()
    const out = await p.listEvents(['NBA'], { status: 'live' })
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect(out.every((e) => e.leagueId === 'NBA' && e.status === 'live')).toBe(true)
  })

  it('accepts a custom event list in the constructor', async () => {
    const custom: NormalizedEvent[] = [
      {
        eventId: 'x-1',
        leagueId: 'TEST',
        sport: 'TEST',
        home: 'A',
        away: 'B',
        startsAt: '2026-01-01T00:00:00Z',
        status: 'pre',
        markets: [] as NormalizedMarket[],
      },
    ]
    const p = new MockProvider(custom)
    const out = await p.listEvents([])
    expect(out.map((e) => e.eventId)).toEqual(['x-1'])
  })
})

/* ───────────────────────── getEvent ───────────────────────── */

describe('MockProvider.getEvent', () => {
  it('returns the matching event (as a clone)', async () => {
    const p = new MockProvider()
    const id = MOCK_EVENTS[0].eventId
    const ev = await p.getEvent(id)
    expect(ev).not.toBeNull()
    expect(ev!.eventId).toBe(id)
    // It's a clone, not the seed object.
    expect(ev).not.toBe(MOCK_EVENTS[0])
    expect(ev!.markets[0].selections[0]).not.toBe(MOCK_EVENTS[0].markets[0].selections[0])
  })

  it('mutating a getEvent result does not corrupt the seed', async () => {
    const p = new MockProvider()
    const id = MOCK_EVENTS[0].eventId
    const first = await p.getEvent(id)
    const before = first!.markets[0].selections[0].priceDisplay.decimal
    first!.markets[0].selections[0].priceDisplay.decimal = -42

    const second = await p.getEvent(id)
    expect(second!.markets[0].selections[0].priceDisplay.decimal).toBe(before)
  })

  it('returns null for an unknown id', async () => {
    const p = new MockProvider()
    const ev = await p.getEvent('no-such-event')
    expect(ev).toBeNull()
  })
})

/* ───────────────────────── provider identity ───────────────────────── */

describe('MockProvider identity', () => {
  it('exposes the stable provider name', () => {
    expect(new MockProvider().name).toBe('mock')
  })
})
