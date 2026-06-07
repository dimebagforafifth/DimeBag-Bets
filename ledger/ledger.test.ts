import { describe, it, expect } from 'vitest'
import type { Account } from '../core/index.js'
import { createLedger, summarize } from './ledger.js'

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'acct_1', creditLimit: 100000, balance: 0, pending: 0, ...overrides }
}

/** A deterministic clock so entry timestamps are predictable in tests. */
function clock() {
  let t = 0
  return () => (t += 1000)
}

describe('ledger wrappers mirror core and record the movement', () => {
  it('records a placement: stake held, balance unchanged', () => {
    const a = account()
    const led = createLedger({ now: clock() })
    const w = led.place(a, 1000, { game: 'mines' })
    expect(a.pending).toBe(1000)
    expect(a.balance).toBe(0)
    const [e] = led.entries()
    expect(e).toMatchObject({
      kind: 'place',
      wagerId: w.id,
      balanceDelta: 0,
      pendingDelta: 1000,
      pendingAfter: 1000,
      meta: { game: 'mines' },
    })
    expect(e.at).toBe(1000)
  })

  it('records a winning grade with the figure delta', () => {
    const a = account()
    const led = createLedger()
    const w = led.place(a, 1000)
    led.resolve(a, w, 'win', 2)
    expect(a.balance).toBe(1000)
    expect(a.pending).toBe(0)
    const e = led.entries().at(-1)!
    expect(e.kind).toBe('resolve')
    expect(e.outcome).toBe('win')
    expect(e.balanceDelta).toBe(1000)
    expect(e.pendingDelta).toBe(-1000)
    expect(e.balanceAfter).toBe(1000)
  })

  it('normalizes the recorded multiplier for non-win grades', () => {
    const a = account()
    const led = createLedger()
    let w = led.place(a, 1000)
    led.resolve(a, w, 'loss')
    expect(led.entries().at(-1)!.multiplier).toBe(0)
    w = led.place(a, 1000)
    led.resolve(a, w, 'push')
    expect(led.entries().at(-1)!.multiplier).toBe(1)
    w = led.place(a, 1000)
    led.resolve(a, w, 'win', 2)
    expect(led.entries().at(-1)!.multiplier).toBe(2)
  })

  it('records resolveAt (fractional settlement)', () => {
    const a = account()
    const led = createLedger()
    const w = led.place(a, 1000)
    led.resolveAt(a, w, 0.5) // half back
    expect(a.balance).toBe(-500)
    const e = led.entries().at(-1)!
    expect(e.outcome).toBe('loss')
    expect(e.balanceDelta).toBe(-500)
  })

  it('records the weekly settle reset', () => {
    const a = account({ balance: 2500 })
    const led = createLedger()
    led.settle(a)
    expect(a.balance).toBe(0)
    const e = led.entries().at(-1)!
    expect(e.kind).toBe('settle')
    expect(e.balanceDelta).toBe(-2500)
    expect(e.balanceAfter).toBe(0)
  })
})

describe('filtering and summary', () => {
  it('filters entries by account', () => {
    const led = createLedger()
    const a = account({ id: 'a' })
    const b = account({ id: 'b' })
    led.place(a, 100)
    led.place(b, 200)
    expect(led.entries('a')).toHaveLength(1)
    expect(led.entries('b')[0].accountId).toBe('b')
    expect(led.entries()).toHaveLength(2)
  })

  it('summarize rolls up turnover and net P&L', () => {
    const a = account()
    const led = createLedger()
    let w = led.place(a, 1000)
    led.resolve(a, w, 'win', 2) // +1000
    w = led.place(a, 1000)
    led.resolve(a, w, 'loss') // -1000
    w = led.place(a, 1000)
    led.resolve(a, w, 'push') // 0
    const s = summarize(led.entries('acct_1'))
    expect(s).toEqual({ placed: 3, resolved: 3, turnover: 3000, net: 0 })
  })

  it('summarize deliberately ignores adjust + settle (they do not distort turnover/net)', () => {
    const a = account()
    const led = createLedger()
    const w = led.place(a, 1000)
    led.resolve(a, w, 'win', 2) // +1000, the only P&L
    led.record({ kind: 'adjust', accountId: a.id, balanceDelta: 5000, pendingDelta: 0, balanceAfter: 0, pendingAfter: 0, actor: 'op', reason: 'comp' })
    led.settle(a) // squares the week to zero
    expect(summarize(led.entries(a.id))).toEqual({ placed: 1, resolved: 1, turnover: 1000, net: 1000 })
  })
})

describe('record (low-level escape hatch)', () => {
  it('appends an arbitrary entry with a sequence + timestamp', () => {
    const led = createLedger({ now: () => 42 })
    const e = led.record({
      kind: 'resolve',
      accountId: 'x',
      balanceDelta: 500,
      pendingDelta: 0,
      balanceAfter: 500,
      pendingAfter: 0,
    })
    expect(e.seq).toBe(1)
    expect(e.at).toBe(42)
    expect(led.entries('x')).toHaveLength(1)
  })

  it('records a manual adjust with actor + reason (the audit trail)', () => {
    const led = createLedger({ now: () => 7 })
    const e = led.record({
      kind: 'adjust',
      accountId: 'p1',
      balanceDelta: 5000,
      pendingDelta: 0,
      balanceAfter: 5000,
      pendingAfter: 0,
      actor: 'operator',
      reason: 'goodwill re-credit',
    })
    expect(e).toMatchObject({ kind: 'adjust', actor: 'operator', reason: 'goodwill re-credit' })
  })
})

describe('persistence hooks (initial + onRecord)', () => {
  it('rehydrates from an initial log and continues the sequence', () => {
    const seed = createLedger({ now: () => 1 })
    const a = account()
    seed.place(a, 1000) // seq 1
    const saved = seed.entries()

    const led = createLedger({ now: () => 2, initial: saved })
    expect(led.entries()).toHaveLength(1) // rehydrated
    const e = led.record({
      kind: 'resolve',
      accountId: a.id,
      balanceDelta: 0,
      pendingDelta: 0,
      balanceAfter: 0,
      pendingAfter: 0,
    })
    expect(e.seq).toBe(2) // continues past the seeded seq, never collides
  })

  it('fires onRecord with the new entry + full log on every record', () => {
    const saves: number[] = []
    const led = createLedger({ onRecord: (_e, log) => saves.push(log.length) })
    const a = account()
    const w = led.place(a, 1000)
    led.resolve(a, w, 'win', 2)
    expect(saves).toEqual([1, 2]) // persisted after each movement
  })

  it('an onRecord cap trims oldest-first; a rehydrate continues seq with no collision', () => {
    const CAP = 3
    const led = createLedger({
      onRecord: (_e, log) => {
        if (log.length > CAP) log.splice(0, log.length - CAP) // same trim book-ledger uses
      },
    })
    for (let i = 0; i < 5; i++) {
      led.record({ kind: 'adjust', accountId: 'p', balanceDelta: i, pendingDelta: 0, balanceAfter: i, pendingAfter: 0 })
    }
    const kept = led.entries()
    expect(kept).toHaveLength(CAP) // capped
    expect(kept[0].balanceDelta).toBe(2) // the two oldest (0,1) were evicted
    const maxSeq = Math.max(...kept.map((e) => e.seq))

    // Rehydrate from the trimmed log: seq must resume ABOVE the surviving max, never reuse one.
    const reload = createLedger({ initial: kept })
    const next = reload.record({ kind: 'adjust', accountId: 'p', balanceDelta: 9, pendingDelta: 0, balanceAfter: 9, pendingAfter: 0 })
    expect(next.seq).toBe(maxSeq + 1)
  })
})
