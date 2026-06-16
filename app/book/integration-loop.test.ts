/**
 * THE FULL LOOP on MockProvider — the wiring-pass acceptance test. It runs the real
 * pieces of both lanes end to end, no mock shortcuts in the middle:
 *
 *   MockProvider (feed) → Poller → Supabase-shaped cache (in-memory) → assembleEvents
 *   → useBookOdds slate (live) → place a credit bet through core → role-scoped activity
 *   → settle → the player's figure moves.
 *
 * Credit/balance only: the bet moves the core Account in integer cents; nothing here
 * carries cash or a cash-out path.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  Poller,
  MockProvider,
  type OddsCache,
  type OddsEventRow,
  type OddsMarketRow,
  type OddsSelectionRow,
} from '../../lib/odds/index.js'
import {
  hydrateFromCache,
  isLiveOdds,
  resetBookOdds,
  getBookOddsSnapshot,
  type OddsCacheReader,
} from './odds-source.js'
import { legFromSelection } from './slip.js'
import { placeBookBet, settleBookBet, __resetPlacement } from './placement.js'
import { betsForViewer, __resetBets } from './bets-store.js'
import { getBook } from '../book-store.js'

/** An in-memory stand-in for Agent 1's Supabase cache — implements the poller's WRITE
 *  seam and exposes a matching READ for the book's cache reader. */
function inMemoryCache() {
  let events: OddsEventRow[] = []
  let markets: OddsMarketRow[] = []
  let selections: OddsSelectionRow[] = []
  const cache: OddsCache = {
    async getOverrides() {
      return new Map()
    },
    async writeEvents(rows) {
      events = rows
    },
    async writeMarkets(rows) {
      markets = rows
    },
    async writeSelections(rows) {
      selections = rows
    },
  }
  const reader: OddsCacheReader = {
    async read() {
      return { events, markets, selections }
    },
  }
  return { cache, reader }
}

beforeEach(() => {
  __resetBets()
  __resetPlacement()
  resetBookOdds()
  for (const m of Object.values(getBook().members)) m.account.pending = 0
})

describe('SGO full loop on MockProvider', () => {
  it('odds → poller → cache → book → bet → role-scoped activity → figure', async () => {
    // 1) FEED → CACHE: the poller pulls the mock slate and writes the cache rows.
    const { cache, reader } = inMemoryCache()
    const poller = new Poller({
      provider: new MockProvider(),
      cache,
      now: () => '2026-06-15T00:00:00Z',
    })
    const res = await poller.pollOnce()
    expect(res.events).toBeGreaterThan(0)
    expect(res.selections).toBeGreaterThan(0)

    // 2) CACHE → BOOK: assemble the rows and flip the book's source to live.
    await hydrateFromCache(reader)
    expect(isLiveOdds()).toBe(true)
    const slate = getBookOddsSnapshot().events
    expect(slate.length).toBe(res.events)
    const ev = slate[0]
    expect(ev.markets.length).toBeGreaterThan(0)
    const market = ev.markets[0]
    const sel = market.selections[0]
    // the UI bets the DISPLAY price (post-margin), never the raw feed price
    expect(sel.priceDisplay.decimal).toBeGreaterThan(1)

    // 3) BOOK → BET (credits through core): a player places off the live slate.
    const marco = getBook().members['p-marco']
    const before = marco.account.balance
    const leg = legFromSelection(ev, market, sel)
    const [bet] = placeBookBet({
      account: marco.account,
      playerName: marco.name,
      placedBy: marco.name,
      legs: [leg],
      mode: 'single',
      stakeCents: 5_000,
      now: 1,
    })
    expect(marco.account.pending).toBe(5_000) // stake HELD, figure not yet moved
    expect(marco.account.balance).toBe(before)

    // 4) MANAGER SURFACE (role-scoped): manager sees it; an off-downline agent doesn't.
    expect(betsForViewer('mgr', 'manager').some((b) => b.id === bet.id)).toBe(true)
    expect(betsForViewer('a-w', 'agent').some((b) => b.id === bet.id)).toBe(false) // West Desk ≠ Marco
    expect(betsForViewer('p-marco', 'player').map((b) => b.id)).toEqual([bet.id])

    // 5) SETTLE → FIGURE: a win releases the hold and moves the figure up.
    settleBookBet(bet.id, { [leg.key]: 'win' }, 2)
    expect(marco.account.pending).toBe(0)
    expect(marco.account.balance).toBeGreaterThan(before)
  })

  it('with no Supabase keys the book stays on the mock fallback (offline)', async () => {
    // connectOddsCache with no reader/env is a no-op → mock source remains
    const { connectOddsCache } = await import('./odds-source.js')
    resetBookOdds()
    const dispose = connectOddsCache({ envSource: {} }) // empty env = no keys
    expect(isLiveOdds()).toBe(false) // still the built-in mock
    expect(getBookOddsSnapshot().events.length).toBeGreaterThan(0)
    dispose()
  })
})
