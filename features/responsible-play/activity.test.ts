/**
 * Activity projections — the read layer over the durable ledger. These prove the summary and
 * the usage reader are pure SUMS that RECONCILE to the ledger rows (the cardinal rule: a
 * projection never mints a credit and must rebuild from the ledger).
 */
import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from '../../ledger/index.js'
import { summarizeActivity, usageSince } from './activity.js'

/** A resolved ledger row. `pendingDelta = −stake`; `balanceDelta = profit` (negative on loss). */
function resolve(over: Partial<LedgerEntry> = {}): LedgerEntry {
  const stake = over.pendingDelta != null ? -over.pendingDelta : 1000
  return {
    seq: 1,
    at: 1_000,
    kind: 'resolve',
    accountId: 'p1',
    balanceDelta: 0,
    pendingDelta: -stake,
    balanceAfter: 0,
    pendingAfter: 0,
    outcome: 'push',
    multiplier: 1,
    meta: { game: 'mines', gameName: 'Mines', stake },
    ...over,
  }
}

describe('summarizeActivity', () => {
  it('reconciles to the ledger: every figure is the sum/extremum of the rows', () => {
    const entries: LedgerEntry[] = [
      resolve({ at: 10, pendingDelta: -1000, balanceDelta: 1000, outcome: 'win', multiplier: 2 }),
      resolve({ at: 20, pendingDelta: -500, balanceDelta: -500, outcome: 'loss', multiplier: 0 }),
      resolve({ at: 30, pendingDelta: -300, balanceDelta: 0, outcome: 'push', multiplier: 1 }),
    ]
    const s = summarizeActivity(entries)
    expect(s.bets).toBe(3)
    expect(s.wins).toBe(1)
    expect(s.losses).toBe(1)
    expect(s.pushes).toBe(1)
    expect(s.wageredCents).toBe(1800) // 1000 + 500 + 300, exactly Σ stake
    expect(s.netCents).toBe(500) // +1000 − 500 + 0, exactly Σ balanceDelta
    expect(s.biggestWinCents).toBe(1000)
    expect(s.firstAt).toBe(10)
    expect(s.lastAt).toBe(30)
    // The two reconciliation identities, stated directly against the rows:
    expect(s.wageredCents).toBe(entries.reduce((n, e) => n + -e.pendingDelta, 0))
    expect(s.netCents).toBe(entries.reduce((n, e) => n + e.balanceDelta, 0))
  })

  it('ignores non-resolve rows (a settle/adjust is not a bet)', () => {
    const entries: LedgerEntry[] = [
      resolve({ balanceDelta: -200, pendingDelta: -200, outcome: 'loss' }),
      { ...resolve(), kind: 'adjust', balanceDelta: 5000, pendingDelta: 0 },
      { ...resolve(), kind: 'settle', balanceDelta: -300, pendingDelta: 0 },
    ]
    const s = summarizeActivity(entries)
    expect(s.bets).toBe(1)
    expect(s.netCents).toBe(-200) // the adjust/settle don't enter the bet net
  })

  it('an empty ledger is all zeros with null timestamps', () => {
    const s = summarizeActivity([])
    expect(s).toMatchObject({ bets: 0, wageredCents: 0, netCents: 0, firstAt: null, lastAt: null })
  })
})

describe('usageSince — what the core gate reads', () => {
  const entries: LedgerEntry[] = [
    resolve({
      accountId: 'p1',
      at: 100,
      pendingDelta: -1000,
      balanceDelta: -1000,
      outcome: 'loss',
    }),
    resolve({ accountId: 'p1', at: 200, pendingDelta: -2000, balanceDelta: 1500, outcome: 'win' }),
    resolve({ accountId: 'p1', at: 50, pendingDelta: -700, balanceDelta: -700, outcome: 'loss' }),
    resolve({
      accountId: 'p2',
      at: 200,
      pendingDelta: -9999,
      balanceDelta: -9999,
      outcome: 'loss',
    }),
  ]

  it('sums turnover + net loss for one player since a timestamp', () => {
    const u = usageSince(entries, 'p1', 100) // drops the at:50 row
    expect(u.wageredCents).toBe(3000) // 1000 + 2000
    expect(u.netLossCents).toBe(-500) // loss 1000 − win 1500
  })

  it('counts the whole period when since is before everything', () => {
    const u = usageSince(entries, 'p1', 0)
    expect(u.wageredCents).toBe(3700) // 1000 + 2000 + 700
    expect(u.netLossCents).toBe(200) // 1000 − 1500 + 700
  })

  it('never bleeds another player or a non-resolve row in', () => {
    const u = usageSince(
      [...entries, { ...resolve(), accountId: 'p1', kind: 'adjust', pendingDelta: -50_000 }],
      'p1',
      0,
    )
    expect(u.wageredCents).toBe(3700) // the p2 row + the adjust row are excluded
  })
})
