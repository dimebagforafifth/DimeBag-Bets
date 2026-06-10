import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Account } from '../../core/index.js'
import { createStore } from '../store.js'
import { EVENTS, type GameEvent, type Selection } from '../markets.js'
import type { SportsbookFeed } from '../provider.js'
import { resetOverlay } from './overlay.js'
import { resetFutures } from './futures.js'
import {
  applyResults,
  clearResult,
  getResult,
  getResultsVersion,
  isResultOverridden,
  resetResults,
  setResult,
  voidEvent,
} from './results.js'

const EV = 'nba-lal-bos' // Lakers (home) vs Celtics (away); ML home −135

/** A clean all-upcoming slate (clone so the EVENTS fixture is never mutated). */
function slate(): GameEvent[] {
  return EVENTS.map((e) => ({
    ...e,
    status: 'upcoming' as const,
    selections: e.selections.map((s) => ({ ...s })),
  }))
}
const ev = (events: GameEvent[], id = EV) => events.find((e) => e.id === id)!
const sel = (eventId: string, suffix: string): Selection =>
  EVENTS.flatMap((e) => e.selections).find((s) => s.id === `${eventId}-${suffix}`)!

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000, balance: 0, pending: 0, ...overrides }
}

/** A feed driven by hand, so settlement is deterministic (no timers). */
function manualFeed(initial: GameEvent[]) {
  let s = initial
  const listeners = new Set<(e: GameEvent[]) => void>()
  const feed: SportsbookFeed = {
    snapshot: () => s,
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
      s = next
      listeners.forEach((l) => l(next))
    },
  }
}

beforeEach(() => {
  resetResults()
  resetOverlay()
  resetFutures()
})
afterEach(() => {
  resetResults()
  resetOverlay()
  resetFutures()
})

describe('results overlay — applyResults', () => {
  it('returns the SAME array reference when nothing is overridden', () => {
    const s = slate()
    expect(applyResults(s)).toBe(s)
  })

  it('a hand-entered result finals the event with an OFFICIAL score', () => {
    setResult(EV, 110, 102)
    const e = ev(applyResults(slate()))
    expect(e.status).toBe('final')
    expect(e.score).toEqual({ home: 110, away: 102, official: true })
    expect(e.progress).toBe(1)
    expect(isResultOverridden(EV)).toBe(true)
    expect(getResult(EV)).toEqual({ kind: 'final', home: 110, away: 102 })
  })

  it('a void finals the event NOT official (so core returns the stake)', () => {
    voidEvent(EV)
    const e = ev(applyResults(slate()))
    expect(e.status).toBe('final')
    expect(e.score?.official).toBe(false)
    expect(getResult(EV)).toEqual({ kind: 'void' })
  })

  it('only the overridden event changes; others pass through untouched', () => {
    setResult(EV, 1, 0)
    const out = applyResults(slate())
    expect(out.filter((e) => e.status === 'final')).toHaveLength(1)
    expect(ev(out, 'nfl-kc-buf').status).toBe('upcoming')
  })

  it('clearResult hands the fixture back to the feed', () => {
    setResult(EV, 1, 0)
    clearResult(EV)
    expect(isResultOverridden(EV)).toBe(false)
    expect(applyResults(slate())).toEqual(slate())
  })

  it('rejects non-integer / negative scores', () => {
    expect(() => setResult(EV, 1.5, 0)).toThrow()
    expect(() => setResult(EV, -1, 0)).toThrow()
    expect(isResultOverridden(EV)).toBe(false)
  })

  it('bumps the version on every change (and not on a no-op clear)', () => {
    const v0 = getResultsVersion()
    setResult(EV, 1, 0)
    const v1 = getResultsVersion()
    expect(v1).toBeGreaterThan(v0)
    clearResult('not-a-real-event') // nothing to delete
    expect(getResultsVersion()).toBe(v1)
  })
})

describe('results overlay — settles through the store/core', () => {
  it('a hand-entered home win settles an open moneyline-home ticket as WON', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [sel(EV, 'moneyline-home')], stake: 1000 }])
    expect(a.pending).toBe(1000)

    setResult(EV, 100, 98) // Lakers (home) win → moneyline-home wins

    expect(store.getState().tickets[0].status).toBe('won')
    expect(a.pending).toBe(0)
    expect(a.balance).toBeGreaterThan(0)
    store.destroy()
  })

  it('a hand-entered home loss settles that ticket as LOST (stake gone)', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [sel(EV, 'moneyline-home')], stake: 1000 }])

    setResult(EV, 98, 100) // away win → moneyline-home loses

    expect(store.getState().tickets[0].status).toBe('lost')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(-1000)
    store.destroy()
  })

  it('voiding a fixture returns the stake (figure unchanged)', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [sel(EV, 'moneyline-home')], stake: 1000 }])

    voidEvent(EV)

    expect(store.getState().tickets[0].status).toBe('void')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(0)
    store.destroy()
  })

  it('one operator action settles EVERY player book (shared singleton)', () => {
    const a1 = account({ id: 'a1' })
    const a2 = account({ id: 'a2' })
    const m1 = manualFeed(slate())
    const m2 = manualFeed(slate())
    const s1 = createStore(a1, { feed: m1.feed })
    const s2 = createStore(a2, { feed: m2.feed })
    s1.place([{ kind: 'single', legs: [sel(EV, 'moneyline-home')], stake: 1000 }])
    s2.place([{ kind: 'single', legs: [sel(EV, 'moneyline-home')], stake: 2000 }])

    setResult(EV, 100, 98) // one action

    expect(s1.getState().tickets[0].status).toBe('won')
    expect(s2.getState().tickets[0].status).toBe('won')
    expect(a1.pending).toBe(0)
    expect(a2.pending).toBe(0)
    s1.destroy()
    s2.destroy()
  })

  it('an override WINS over a looping feed (the event stays final)', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    setResult(EV, 100, 98)
    expect(store.getState().tickets).toHaveLength(0)
    // The demo feed loops the event back to 'upcoming' — the override holds it final.
    m.push(slate())
    expect(ev(store.getState().events).status).toBe('final')
    store.destroy()
  })
})

describe('manual correction re-settles an already-graded ticket (CLAUDE.md §4 palpable error)', () => {
  /** A slate clone with one event finalled at a (wrong) feed score. */
  const feedFinal = (home: number, away: number) =>
    slate().map((e) => (e.id === EV ? { ...e, status: 'final' as const, score: { home, away } } : e))

  it('corrects a payout the feed already settled at the WRONG score (and round-trips exactly)', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [sel(EV, 'moneyline-home')], stake: 1000 }])

    // The feed finals it WRONG (away win) → the open ticket auto-settles as a loss.
    m.push(feedFinal(98, 100))
    expect(store.getState().tickets[0].status).toBe('lost')
    expect(a.balance).toBe(-1000)

    // The operator corrects the result by hand → the settled ticket re-grades to a win.
    setResult(EV, 100, 98)
    const t = store.getState().tickets[0]
    expect(t.status).toBe('won')
    expect(a.pending).toBe(0)
    const wonBalance = a.balance
    expect(wonBalance).toBeGreaterThan(0)

    // Correcting back to the original (away win) reverses it EXACTLY — no drift.
    setResult(EV, 98, 100)
    expect(store.getState().tickets[0].status).toBe('lost')
    expect(a.balance).toBe(-1000)
    store.destroy()
  })

  it('re-applying the SAME corrected result moves no money (idempotent)', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [sel(EV, 'moneyline-home')], stake: 1000 }])
    m.push(feedFinal(98, 100)) // auto-settled lost

    setResult(EV, 120, 100) // correct to a win
    const after = a.balance
    setResult(EV, 120, 100) // identical — a no-op
    expect(a.balance).toBe(after)
    store.destroy()
  })

  it('a void corrects a feed-settled loss back to a returned stake', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [sel(EV, 'moneyline-home')], stake: 1000 }])
    m.push(feedFinal(98, 100)) // lost, balance −1000

    voidEvent(EV) // postponed-and-abandoned ruling after the fact → stake returned
    expect(store.getState().tickets[0].status).toBe('void')
    expect(a.balance).toBe(0)
    expect(a.pending).toBe(0)
    store.destroy()
  })

  it('respects the per-head max-payout cap when correcting (no cap bypass, exact figure)', () => {
    // Celtics (away) ML +115 → uncapped profit on $10 = 1150; the operator caps wins at 500.
    const a = account({ maxPayout: 500 })
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([{ kind: 'single', legs: [sel(EV, 'moneyline-away')], stake: 1000 }])

    // Feed finals it WRONG (home win) → away ticket auto-settles lost.
    m.push(feedFinal(100, 98))
    expect(a.balance).toBe(-1000)

    // Correct to the away win → a CAPPED win, not the uncapped 1150.
    setResult(EV, 98, 100)
    expect(store.getState().tickets[0].status).toBe('won')
    expect(a.balance).toBe(500) // exactly a clean capped grade — cap not bypassed

    // Re-applying the identical result moves nothing (idempotent under the cap).
    setResult(EV, 98, 100)
    expect(a.balance).toBe(500)

    // Correct back down to a loss → exactly −stake, no over-clawback off the uncapped return.
    setResult(EV, 100, 98)
    expect(store.getState().tickets[0].status).toBe('lost')
    expect(a.balance).toBe(-1000)
    store.destroy()
  })

  it('caps a corrected PARLAY win too (the cap applies on the combined decimal)', () => {
    const a = account({ maxPayout: 500 }) // combined away+away decimal ≫ this
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    store.place([
      {
        kind: 'parlay',
        legs: [sel(EV, 'moneyline-away'), sel('nfl-kc-buf', 'moneyline-away')],
        stake: 1000,
      },
    ])
    // Feed finals BOTH as home wins → the parlay loses.
    m.push(
      slate().map((e) =>
        e.id === EV
          ? { ...e, status: 'final' as const, score: { home: 100, away: 98 } }
          : e.id === 'nfl-kc-buf'
            ? { ...e, status: 'final' as const, score: { home: 30, away: 20 } }
            : e,
      ),
    )
    expect(store.getState().tickets[0].status).toBe('lost')
    expect(a.balance).toBe(-1000)

    // Operator corrects both to away wins → both legs win → a CAPPED parlay win.
    setResult(EV, 98, 100)
    setResult('nfl-kc-buf', 20, 30)
    expect(store.getState().tickets[0].status).toBe('won')
    expect(a.balance).toBe(500) // capped, not the (large) uncapped combined return
    store.destroy()
  })

  it('does NOT re-grade a cashed-out ticket (the player took a settled price)', () => {
    const a = account()
    const m = manualFeed(slate())
    const store = createStore(a, { feed: m.feed })
    const [t] = store.place([{ kind: 'single', legs: [sel(EV, 'moneyline-home')], stake: 1000 }])
    // Game goes live, the player cashes out, then the operator grades the final.
    m.push(slate().map((e) => (e.id === EV ? { ...e, status: 'live' as const, score: { home: 30, away: 10 }, progress: 0.6 } : e)))
    store.cashOut(t.id)
    expect(store.getState().tickets[0].status).toBe('cashed')
    const cashed = a.balance

    setResult(EV, 0, 99) // away blowout — would have been a loss
    expect(store.getState().tickets[0].status).toBe('cashed') // untouched
    expect(a.balance).toBe(cashed)
    store.destroy()
  })
})
