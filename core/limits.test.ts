/**
 * Responsible-play self-limits — the placeWager gate + the tighten-now / loosen-later policy.
 * Money never moves here; these prove the GATE accepts/rejects and that default play is
 * byte-identical when no limit is set.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Account } from './types.js'
import { placeWager, resolveWager } from './core.js'
import {
  __resetLimits,
  assertWithinLimits,
  clearPlayerLimit,
  getEffectiveLimits,
  getPlayerLimitState,
  LOOSEN_DELAY_MS,
  periodStartMs,
  setLimitsClock,
  setLimitUsageReader,
  setPlayerLimit,
  type LimitUsage,
} from './limits.js'

function account(over: Partial<Account> = {}): Account {
  return { id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0, ...over }
}

// A pinned clock + a controllable usage source, so caps + cool-off are deterministic.
let nowMs = 1_700_000_000_000 // a fixed Tue; periodStart math is exercised separately
let usage: LimitUsage = { wageredCents: 0, netLossCents: 0 }

beforeEach(() => {
  __resetLimits()
  nowMs = 1_700_000_000_000
  usage = { wageredCents: 0, netLossCents: 0 }
  setLimitsClock(() => nowMs)
  setLimitUsageReader(() => usage)
})
afterEach(() => __resetLimits())

describe('off-by-default', () => {
  it('an unlimited player places exactly as before (gate is a no-op)', () => {
    const a = account()
    expect(() => assertWithinLimits(a, 500)).not.toThrow()
    const w = placeWager(a, 500)
    expect(w.stake).toBe(500)
    expect(a.pending).toBe(500)
  })
})

describe('wager cap', () => {
  it('rejects a single stake over the cap at placeWager', () => {
    const a = account()
    setPlayerLimit('p1', { kind: 'wager', period: 'day', amountCents: 10_000 }) // $100/day
    expect(() => placeWager(a, 10_001)).toThrow(/wager limit/)
    expect(a.pending).toBe(0) // no hold taken on a rejected wager
  })

  it('counts period-to-date turnover from the usage reader (wagered + stake > cap)', () => {
    const a = account()
    setPlayerLimit('p1', { kind: 'wager', period: 'day', amountCents: 10_000 })
    usage = { wageredCents: 9_500, netLossCents: 0 } // $95 already staked today
    expect(() => placeWager(a, 600)).toThrow(/wager limit/) // 9_500 + 600 > 10_000
    expect(() => placeWager(a, 500)).not.toThrow() // 9_500 + 500 == 10_000, exactly at cap
  })

  it('counts LIVE pending too, so many simultaneous open bets can’t evade the cap', () => {
    const a = account()
    setPlayerLimit('p1', { kind: 'wager', period: 'day', amountCents: 10_000 })
    // No resolved turnover yet (usage stays zero), but holds accumulate in pending.
    placeWager(a, 6_000)
    expect(a.pending).toBe(6_000)
    // The next bet sees 0 resolved + 6_000 pending + 5_000 > 10_000 → rejected.
    expect(() => placeWager(a, 5_000)).toThrow(/wager limit/)
    expect(() => placeWager(a, 4_000)).not.toThrow() // 0 + 6_000 + 4_000 == cap
  })
})

describe('loss cap', () => {
  it('rejects when net-loss-so-far + stake would exceed the cap', () => {
    const a = account()
    setPlayerLimit('p1', { kind: 'loss', period: 'week', amountCents: 20_000 }) // $200/wk
    usage = { wageredCents: 0, netLossCents: 19_000 } // already down $190 this week
    expect(() => placeWager(a, 1_500)).toThrow(/loss limit/) // 19_000 + 1_500 > 20_000
    expect(() => placeWager(a, 1_000)).not.toThrow() // 19_000 + 1_000 == 20_000
  })

  it('a net-ahead player keeps headroom (negative net loss)', () => {
    const a = account()
    setPlayerLimit('p1', { kind: 'loss', period: 'day', amountCents: 10_000 })
    usage = { wageredCents: 0, netLossCents: -5_000 } // up $50
    expect(() => assertWithinLimits(a, 14_000)).not.toThrow() // -5_000 + 14_000 < 10_000
  })
})

describe('cool-off', () => {
  it('blocks every wager until the window expires, then allows again', () => {
    const a = account()
    const until = nowMs + 3 * 86_400_000 // 3-day self-exclusion
    setPlayerLimit('p1', { kind: 'cooloff', until })
    expect(() => placeWager(a, 100)).toThrow(/cool-off/)

    nowMs = until - 1
    expect(() => placeWager(a, 100)).toThrow(/cool-off/)

    nowMs = until // expiry reached → open again
    expect(() => placeWager(a, 100)).not.toThrow()
  })
})

describe('tighten now / loosen later', () => {
  it('tightening a cap applies immediately', () => {
    setPlayerLimit('p1', { kind: 'wager', period: 'day', amountCents: 10_000 })
    const r = setPlayerLimit('p1', { kind: 'wager', period: 'day', amountCents: 5_000 })
    expect(r.deferred).toBe(false)
    expect(getEffectiveLimits('p1').wager?.amountCents).toBe(5_000)
  })

  it('loosening a cap is deferred by the delay, holding the stricter limit until then', () => {
    setPlayerLimit('p1', { kind: 'wager', period: 'day', amountCents: 5_000 })
    const r = setPlayerLimit('p1', { kind: 'wager', period: 'day', amountCents: 20_000 })
    expect(r.deferred).toBe(true)
    // Still the stricter $50 cap right now…
    expect(getEffectiveLimits('p1').wager?.amountCents).toBe(5_000)
    const a = account()
    expect(() => placeWager(a, 8_000)).toThrow(/wager limit/)

    // …until the delay elapses, when the looser $200 cap takes effect.
    nowMs += LOOSEN_DELAY_MS
    expect(getEffectiveLimits('p1').wager?.amountCents).toBe(20_000)
    expect(() => placeWager(account(), 8_000)).not.toThrow()
  })

  it('exposes a queued loosening as pending for the UI', () => {
    setPlayerLimit('p1', { kind: 'loss', period: 'day', amountCents: 5_000 })
    setPlayerLimit('p1', { kind: 'loss', period: 'day', amountCents: 9_000 })
    const state = getPlayerLimitState('p1').loss!
    expect(state.active.amountCents).toBe(5_000)
    expect(state.pending?.amountCents).toBe(9_000)
    expect(state.pending?.effectiveAt).toBe(nowMs + LOOSEN_DELAY_MS)
  })

  it('a cool-off can never be ended early (a shortening waits past the original expiry)', () => {
    const until = nowMs + 7 * 86_400_000
    setPlayerLimit('p1', { kind: 'cooloff', until })
    const r = setPlayerLimit('p1', { kind: 'cooloff', until: nowMs + 86_400_000 }) // try to shorten
    expect(r.deferred).toBe(true)
    expect(getPlayerLimitState('p1').cooloff!.pending?.effectiveAt).toBeGreaterThanOrEqual(until)
  })
})

describe('session reminder (soft — never a gate)', () => {
  it('changes apply immediately, and a session limit never blocks a wager', () => {
    setPlayerLimit('p1', { kind: 'session', amountCents: 30 }) // 30-min reminder
    expect(getEffectiveLimits('p1').session?.amountCents).toBe(30)
    // Loosening (longer interval) is immediate for a soft reminder — not deferred.
    const r = setPlayerLimit('p1', { kind: 'session', amountCents: 60 })
    expect(r.deferred).toBe(false)
    expect(getEffectiveLimits('p1').session?.amountCents).toBe(60)
    // It is purely informational — a session reminder alone never rejects a wager.
    expect(() => placeWager(account(), 999_999)).not.toThrow()
  })
})

describe('clearing a limit', () => {
  it('removing a cap is a loosening (deferred), returning the player to untracked after', () => {
    setPlayerLimit('p1', { kind: 'wager', period: 'day', amountCents: 5_000 })
    const r = clearPlayerLimit('p1', 'wager')
    expect(r.deferred).toBe(true)
    expect(getEffectiveLimits('p1').wager?.amountCents).toBe(5_000) // still capped during delay
    nowMs += LOOSEN_DELAY_MS
    expect(getEffectiveLimits('p1').wager).toBeUndefined() // cap gone
  })
})

describe('periodStartMs', () => {
  it('buckets a day to UTC midnight and a week to a Monday', () => {
    const day = periodStartMs('day', Date.UTC(2026, 5, 18, 15, 30)) // 2026-06-18 15:30Z (Thu)
    expect(day).toBe(Date.UTC(2026, 5, 18, 0, 0))
    const week = periodStartMs('week', Date.UTC(2026, 5, 18, 15, 30))
    expect(new Date(week).getUTCDay()).toBe(1) // Monday
    expect(week).toBe(Date.UTC(2026, 5, 15, 0, 0)) // Mon 2026-06-15
  })
})

describe('the gate does not move money', () => {
  it('a rejected wager leaves the figure and a resolved one settles normally', () => {
    const a = account({ balance: 1_000 })
    setPlayerLimit('p1', { kind: 'wager', period: 'day', amountCents: 10_000 })
    expect(() => placeWager(a, 20_000)).toThrow()
    expect(a).toMatchObject({ balance: 1_000, pending: 0 }) // untouched

    const w = placeWager(a, 1_000)
    resolveWager(a, w, 'win', 2)
    expect(a.balance).toBe(2_000)
    expect(a.pending).toBe(0)
  })
})
