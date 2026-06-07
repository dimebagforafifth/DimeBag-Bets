import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Account } from '../core/index.js'
import { createStore } from './store.js'
import { EVENTS, type GameEvent, type Selection } from './markets.js'
import type { SportsbookFeed } from './provider.js'
import { nudgeLine, resetOverlay, setMarketSuspended } from './book/overlay.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000, balance: 0, pending: 0, ...overrides }
}

/** A feed we drive by hand, so settlement is deterministic (no timers). */
function manualFeed(initial: GameEvent[]) {
  let slate = initial
  const listeners = new Set<(e: GameEvent[]) => void>()
  const feed: SportsbookFeed = {
    snapshot: () => slate,
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    start() {},
    stop() {},
  }
  return {
    feed,
    push(next: GameEvent[]) {
      slate = next
      listeners.forEach((l) => l(next))
    },
  }
}

/** A slate clone with per-event overrides; everything else upcoming. */
function slate(overrides: Record<string, Partial<GameEvent>> = {}): GameEvent[] {
  return EVENTS.map((e) => {
    const o = overrides[e.id]
    return o ? { ...e, ...o } : { ...e, status: 'upcoming' as const }
  })
}

const sel = (eventId: string, suffix: string): Selection =>
  EVENTS.flatMap((e) => e.selections).find((s) => s.id === `${eventId}-${suffix}`)!

describe('place', () => {
  it('holds the stake on an upcoming game', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 }])
    expect(a.pending).toBe(1000)
    expect(store.getState().tickets).toHaveLength(1)
  })

  it('refuses bets once a game is no longer upcoming', () => {
    const a = account()
    const m = manualFeed(slate({ 'nba-lal-bos': { status: 'live', score: { home: 10, away: 8 } } }))
    const store = createStore(a, { feed: m.feed })
    expect(() =>
      store.place([{ kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 }]),
    ).toThrow(/closed/)
    expect(a.pending).toBe(0)
  })
})

describe('live (in-play) betting', () => {
  const liveLeg = (eventId: string): Selection => ({
    ...sel(eventId, 'moneyline-home'),
    id: `${eventId}-live-ml-home`,
    live: true,
  })

  it('accepts a live bet on a game that is in progress', () => {
    const a = account()
    const m = manualFeed(slate({ 'nba-lal-bos': { status: 'live', score: { home: 20, away: 14 }, progress: 0.4 } }))
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [liveLeg('nba-lal-bos')], stake: 1000 }])
    expect(a.pending).toBe(1000)
    expect(store.getState().tickets[0].status).toBe('open')
  })

  it('rejects a pre-game pick once the game is live, and a live pick before kickoff', () => {
    const a = account()
    const m = manualFeed(slate({ 'nba-lal-bos': { status: 'live', score: { home: 1, away: 0 }, progress: 0.2 } }))
    const store = createStore(a, { feed: m.feed })
    // pre-game moneyline is closed now that it's live
    expect(() =>
      store.place([{ kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 }]),
    ).toThrow(/closed/)
    // a live pick on a game that hasn't kicked off is also closed
    expect(() =>
      store.place([{ kind: 'single', legs: [liveLeg('nfl-kc-buf')], stake: 1000 }]),
    ).toThrow(/closed/)
  })
})

describe('book line management (overlay)', () => {
  beforeEach(() => resetOverlay())
  afterEach(() => resetOverlay())

  const mlHome = (id: string) => `${id}-moneyline-home`

  it('refuses a bet on a market the book suspends, then accepts it once lifted', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })

    setMarketSuspended('nba-lal-bos', 'moneyline', true)
    // the store re-derived the player slate live (no feed push needed)
    const shown = store
      .getState()
      .events.find((e) => e.id === 'nba-lal-bos')!
      .selections.find((s) => s.id === mlHome('nba-lal-bos'))!
    expect(shown.suspended).toBe(true)

    expect(() =>
      store.place([{ kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 }]),
    ).toThrow(/suspended/)
    expect(a.pending).toBe(0)

    setMarketSuspended('nba-lal-bos', 'moneyline', false)
    store.place([{ kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 }])
    expect(a.pending).toBe(1000)
    store.destroy()
  })

  it('a manager line move re-prices the player slate without a feed push', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })

    nudgeLine('nba-lal-bos', 'total', 2) // 224.5 → 226.5
    const over = store
      .getState()
      .events.find((e) => e.id === 'nba-lal-bos')!
      .selections.find((s) => s.id === 'nba-lal-bos-total-over')!
    expect(over.line).toBe(226.5)
    expect(over.label).toBe('Over 226.5')
    store.destroy()
  })
})

describe('auto-settlement', () => {
  it('settles a single when its game finals, adjusting the figure', () => {
    const a = account()
    const m = manualFeed(slate())
    let balanceChanges = 0
    const store = createStore(a, { feed: m.feed, onBalanceChange: () => (balanceChanges += 1) })

    store.place([{ kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 }])
    expect(balanceChanges).toBe(1) // the placement

    // Lakers win → moneyline home wins.
    m.push(slate({ 'nba-lal-bos': { status: 'final', score: { home: 118, away: 110 } } }))

    const ticket = store.getState().tickets[0]
    expect(ticket.status).toBe('won')
    expect(a.pending).toBe(0)
    expect(a.balance).toBeGreaterThan(0)
    expect(balanceChanges).toBe(2) // placement + settlement
  })

  it('holds a parlay open until every leg is final', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([
      {
        kind: 'parlay',
        legs: [sel('nba-lal-bos', 'moneyline-home'), sel('nfl-kc-buf', 'moneyline-home')],
        stake: 1000,
      },
    ])

    // Only one leg final → still open.
    m.push(slate({ 'nba-lal-bos': { status: 'final', score: { home: 118, away: 110 } } }))
    expect(store.getState().tickets[0].status).toBe('open')

    // Both final → settles.
    m.push(
      slate({
        'nba-lal-bos': { status: 'final', score: { home: 118, away: 110 } },
        'nfl-kc-buf': { status: 'final', score: { home: 27, away: 24 } },
      }),
    )
    expect(store.getState().tickets[0].status).toBe('won')
  })

  it('kills a parlay the moment one leg loses, without waiting for the rest', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([
      {
        kind: 'parlay',
        legs: [sel('nba-lal-bos', 'moneyline-home'), sel('nfl-kc-buf', 'moneyline-home')],
        stake: 1000,
      },
    ])
    // Lakers (home) lose; the other game hasn't even started.
    m.push(slate({ 'nba-lal-bos': { status: 'final', score: { home: 100, away: 120 } } }))
    expect(store.getState().tickets[0].status).toBe('lost')
    expect(a.balance).toBe(-1000)
  })

  it('cashes out an open ticket at its live value', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 }])
    m.push(slate({ 'nba-lal-bos': { status: 'live', score: { home: 30, away: 12 }, progress: 0.9 } }))

    const value = store.cashOutValueOf(store.getState().tickets[0].id)
    expect(value).toBeGreaterThan(0)
    store.cashOut(store.getState().tickets[0].id)
    expect(store.getState().tickets[0].status).toBe('cashed')
    expect(a.balance).toBe(value - 1000)
  })

  it('does not re-settle when the looped slate re-opens a game', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [sel('nba-lal-bos', 'moneyline-home')], stake: 1000 }])
    m.push(slate({ 'nba-lal-bos': { status: 'final', score: { home: 118, away: 110 } } }))
    const after = a.balance
    m.push(slate()) // loop: everything upcoming again
    expect(store.getState().tickets[0].status).toBe('won')
    expect(a.balance).toBe(after) // unchanged — settled tickets are left alone
  })
})
