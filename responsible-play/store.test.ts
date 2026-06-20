/**
 * Responsible-play store — the player-owned persistence + core hydration + the gate's ledger
 * wiring. Proves: set/clear flow through CORE (no parallel money path), reload rehydrates the
 * policy verbatim, and the gate counts REAL durable-ledger turnover end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Account } from '../core/index.js'
import {
  __resetLimits,
  assertWithinLimits,
  getEffectiveLimits,
  LOOSEN_DELAY_MS,
  periodStartMs,
  placeWager,
  resolveWager,
  setLimitsClock,
  setLimitUsageReader,
} from '../core/index.js'
import { getBook } from '../app/book-store.js'
import { getBookLedger } from '../app/book-ledger.js'
import {
  __hydrateFromDoc,
  __resetResponsiblePlay,
  clearLimit,
  limitedPlayerIds,
  limitStateOf,
  setLimit,
  usageSince,
} from './index.js'

const account = (over: Partial<Account> = {}): Account => ({
  id: 'p1',
  creditLimit: 1_000_000,
  balance: 0,
  pending: 0,
  ...over,
})

beforeEach(() => __resetResponsiblePlay())
afterEach(() => __resetResponsiblePlay())

describe('off-by-default', () => {
  it('no limit set → player untracked + placement unchanged', () => {
    expect(limitedPlayerIds()).toEqual([])
    const a = account()
    expect(() => placeWager(a, 5_000)).not.toThrow()
    expect(a.pending).toBe(5_000)
  })
})

describe('set / clear flows through core (deterministic gate)', () => {
  let nowMs = 1_700_000_000_000
  let usage = { wageredCents: 0, netLossCents: 0 }
  beforeEach(() => {
    nowMs = 1_700_000_000_000
    usage = { wageredCents: 0, netLossCents: 0 }
    setLimitsClock(() => nowMs)
    setLimitUsageReader(() => usage) // override the live-ledger wiring for a controlled gate
  })

  it('setLimit registers the player and the gate enforces the cap', () => {
    setLimit('p1', { kind: 'wager', period: 'day', amountCents: 10_000 })
    expect(limitedPlayerIds()).toEqual(['p1'])
    expect(limitStateOf('p1').wager?.active.amountCents).toBe(10_000)
    expect(() => placeWager(account(), 10_001)).toThrow(/wager limit/)
  })

  it('clearLimit is deferred (loosening); the cap holds for the delay then lapses', () => {
    setLimit('p1', { kind: 'wager', period: 'day', amountCents: 5_000 })
    const r = clearLimit('p1', 'wager')
    expect(r.deferred).toBe(true)
    expect(getEffectiveLimits('p1').wager?.amountCents).toBe(5_000) // still capped now
    expect(() => placeWager(account(), 6_000)).toThrow()

    nowMs += LOOSEN_DELAY_MS
    expect(getEffectiveLimits('p1').wager).toBeUndefined()
    expect(limitedPlayerIds()).toEqual([]) // a lapsed removal drops out of the operator view
    expect(() => placeWager(account(), 6_000)).not.toThrow()
  })
})

describe('persistence rehydration (simulated reload)', () => {
  it('a reload restores the policy verbatim from the persisted doc', () => {
    const fixed = 1_700_000_000_000
    setLimitsClock(() => fixed)
    setLimit('p1', { kind: 'loss', period: 'week', amountCents: 25_000 })

    // Simulate a reload: drop core's in-memory policy, then rehydrate from disk.
    __resetLimits()
    setLimitsClock(() => fixed)
    expect(getEffectiveLimits('p1').loss).toBeUndefined() // gone from core after the reset
    __hydrateFromDoc()
    expect(getEffectiveLimits('p1').loss?.amountCents).toBe(25_000) // restored from the doc
  })
})

describe('gate ↔ durable ledger, end to end (real wiring)', () => {
  it("the wager cap counts the player's real resolved turnover from the book ledger", () => {
    const player = Object.values(getBook().members).find((m) => m.role === 'player')!
    const since = periodStartMs('day', Date.now())
    const before = usageSince(getBookLedger(), player.id, since).wageredCents

    // Create real turnover: place + resolve a $40 loss → a durable 'resolve' row lands.
    const w = placeWager(player.account, 4_000)
    resolveWager(player.account, w, 'loss')
    const after = usageSince(getBookLedger(), player.id, since).wageredCents
    expect(after).toBe(before + 4_000)

    // Cap just above current turnover; the gate (reading the SAME ledger) must respect it.
    setLimit(player.id, { kind: 'wager', period: 'day', amountCents: after + 2_000 })
    expect(() => assertWithinLimits(player.account, 2_001)).toThrow(/wager limit/) // after + 2_001 > cap
    expect(() => assertWithinLimits(player.account, 2_000)).not.toThrow() // exactly at the cap
  })
})
