/**
 * Responsible-play limits BLOCK over-limit play. Covers the pure rule evaluator
 * (per-bet cap, session loss cap, session time cap, cooldown, precedence) and the
 * live store/session tracking that feeds it (losses accumulate, a cooldown holds,
 * an idle gap starts a fresh session). Pure functions are driven with explicit
 * `now`, so there are no timers.
 */

import { describe, it, expect } from 'vitest'
import {
  evaluatePlay,
  netLossCents,
  sessionMinutesElapsed,
  setLimits,
  startCooldown,
  checkPlay,
  noteBet,
  noteResult,
  resetSession,
  getSession,
  SESSION_IDLE_RESET_MS,
  type SessionState,
} from './responsible-play.js'

const sess = (over: Partial<SessionState> = {}): SessionState => ({
  startedAt: 0,
  netCents: 0,
  bets: 0,
  lastAt: 0,
  ...over,
})

describe('evaluatePlay (pure)', () => {
  it('allows play within all limits', () => {
    expect(evaluatePlay({}, sess(), 1000).allowed).toBe(true)
    expect(evaluatePlay({ perBetMax: 5000 }, sess(), 1000, 4000).allowed).toBe(true)
  })

  it('blocks a stake over the per-bet cap', () => {
    const r = evaluatePlay({ perBetMax: 5000 }, sess(), 1000, 6000)
    expect(r.allowed).toBe(false)
    expect(r.kind).toBe('perBet')
  })

  it('blocks once net session loss reaches the loss limit', () => {
    expect(evaluatePlay({ sessionLossLimit: 5000 }, sess({ netCents: -4999 }), 1000).allowed).toBe(true)
    const r = evaluatePlay({ sessionLossLimit: 5000 }, sess({ netCents: -5000 }), 1000)
    expect(r.allowed).toBe(false)
    expect(r.kind).toBe('loss')
  })

  it('blocks once the session time limit is reached', () => {
    expect(evaluatePlay({ sessionMinutes: 30 }, sess({ startedAt: 0 }), 29 * 60_000).allowed).toBe(true)
    const r = evaluatePlay({ sessionMinutes: 30 }, sess({ startedAt: 0 }), 31 * 60_000)
    expect(r.allowed).toBe(false)
    expect(r.kind).toBe('time')
  })

  it('blocks during a cooldown and reopens when it lifts', () => {
    const r = evaluatePlay({ cooldownUntil: 2000 }, sess(), 1000)
    expect(r.allowed).toBe(false)
    expect(r.kind).toBe('cooldown')
    expect(r.until).toBe(2000)
    expect(evaluatePlay({ cooldownUntil: 2000 }, sess(), 2000).allowed).toBe(true)
  })

  it('applies the cooldown before any other block', () => {
    const r = evaluatePlay(
      { cooldownUntil: 9999, sessionLossLimit: 1, perBetMax: 1 },
      sess({ netCents: -5000 }),
      1000,
      999999,
    )
    expect(r.kind).toBe('cooldown')
  })
})

describe('helpers', () => {
  it('net loss is the positive shortfall, 0 when up', () => {
    expect(netLossCents(sess({ netCents: -3000 }))).toBe(3000)
    expect(netLossCents(sess({ netCents: 1000 }))).toBe(0)
  })
  it('session minutes elapse from startedAt (0 with no session)', () => {
    expect(sessionMinutesElapsed(sess({ startedAt: 0 }), 90_000)).toBeCloseTo(1.5, 5)
    expect(sessionMinutesElapsed(sess({ startedAt: null }), 90_000)).toBe(0)
  })
})

describe('store: tracking blocks over-limit play', () => {
  it('accumulating losses past the limit blocks further play', () => {
    const id = 'rp-loss'
    resetSession(id)
    setLimits(id, { sessionLossLimit: 3000, cooldownUntil: undefined })
    noteBet(id, 1000, 1000)
    expect(checkPlay(id, 1000).allowed).toBe(true)
    noteResult(id, -2000, 1100)
    expect(checkPlay(id, 1100).allowed).toBe(true) // 2000 < 3000
    noteResult(id, -1500, 1200)
    const r = checkPlay(id, 1200)
    expect(r.allowed).toBe(false) // 3500 ≥ 3000
    expect(r.kind).toBe('loss')
  })

  it('a take-a-break cooldown blocks until it lifts', () => {
    const id = 'rp-cool'
    resetSession(id)
    setLimits(id, { sessionLossLimit: undefined })
    startCooldown(id, 60_000, 10_000)
    expect(checkPlay(id, 40_000).allowed).toBe(false)
    expect(checkPlay(id, 70_000).allowed).toBe(true)
  })

  it('an idle gap starts a fresh session, resetting the running loss', () => {
    const id = 'rp-idle'
    resetSession(id)
    setLimits(id, { sessionLossLimit: 3000, cooldownUntil: undefined })
    noteBet(id, 1000, 0)
    noteResult(id, -3000, 100)
    expect(checkPlay(id, 100).allowed).toBe(false) // limit hit this session

    const later = 100 + SESSION_IDLE_RESET_MS + 1
    noteBet(id, 1000, later) // long gap → brand new session
    expect(getSession(id).netCents).toBe(0)
    expect(checkPlay(id, later).allowed).toBe(true)
  })
})
