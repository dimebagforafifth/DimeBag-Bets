/**
 * Entries run on the SHARED core: placing holds the stake in `pending` (figure unchanged),
 * settling releases it and moves the figure by the table multiplier. Power, flex, void, the
 * contradiction guard, over-available, and the demo seeding — all asserted against a real
 * core Account. Integer cents only; no separate money path.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Member } from '../org/index.js'
import { onWagerResolved } from '../../core/index.js'
import { getBook } from '../../app/book-store.js'
import { resetBookOdds } from '../../app/book/odds-source.js'
import { boardProjections, type Projection } from './projections.js'
import {
  placeEntry,
  settleEntry,
  seedDemoEntries,
  entriesForAccount,
  getEntries,
  __resetEntries,
  type PickemEntry,
} from './entries.js'
import type { PickResult, PickSide } from './engine.js'

const NOW = 1_750_000_000_000

function anyPlayer(): Member {
  const p = Object.values(getBook().members).find((m) => m.role === 'player')
  if (!p) throw new Error('no seeded player')
  return p
}
/** First N board projections, each a distinct player+stat (the board has no dup keys). */
function distinctProjections(n: number): Projection[] {
  const seen = new Set<string>()
  const out: Projection[] = []
  for (const p of boardProjections()) {
    const k = `${p.playerId}::${p.statId}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
    if (out.length === n) break
  }
  return out
}
function entryOf(projections: Projection[], sides: PickSide[]) {
  return projections.map((projection, i) => ({ projection, side: sides[i] }))
}
function allResults(projections: Projection[], results: PickResult[]): Record<string, PickResult> {
  return Object.fromEntries(projections.map((p, i) => [p.id, results[i]]))
}

beforeEach(() => {
  __resetEntries()
  resetBookOdds()
  for (const m of Object.values(getBook().members)) m.account.pending = 0
})

describe('placeEntry — holds the stake through core', () => {
  it('holds pending without moving the figure', () => {
    const p = anyPlayer()
    const a = p.account
    const before = a.balance
    const projs = distinctProjections(3)
    const entry = placeEntry({
      account: a,
      playerName: p.name,
      mode: 'power',
      picks: entryOf(projs, ['higher', 'lower', 'higher']),
      stakeCents: 5_000,
      now: NOW,
    })
    expect(a.pending).toBe(5_000)
    expect(a.balance).toBe(before) // figure unchanged until graded
    expect(entry.status).toBe('open')
    expect(entry.topMultiple).toBe(5) // 3-pick power
    expect(getEntries()).toHaveLength(1)
  })
})

describe('settleEntry — POWER through core', () => {
  it('a clean sweep pays the table multiple', () => {
    const p = anyPlayer()
    const a = p.account
    const before = a.balance
    const projs = distinctProjections(3)
    const entry = placeEntry({
      account: a,
      playerName: p.name,
      mode: 'power',
      picks: entryOf(projs, ['higher', 'lower', 'higher']),
      stakeCents: 5_000,
      now: NOW,
    })
    const status = settleEntry(entry.id, allResults(projs, ['higher', 'lower', 'higher']), NOW)
    expect(status).toBe('won')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(before + 5_000 * (5 - 1)) // 5x power → +$200 on $50
    const settled = getEntries().find((e) => e.id === entry.id)!
    expect(settled.returnCents).toBe(25_000)
    expect(settled.payoutMultiple).toBe(5)
  })

  it('a single miss loses the stake', () => {
    const p = anyPlayer()
    const a = p.account
    const before = a.balance
    const projs = distinctProjections(3)
    const entry = placeEntry({
      account: a,
      playerName: p.name,
      mode: 'power',
      picks: entryOf(projs, ['higher', 'higher', 'higher']),
      stakeCents: 4_000,
      now: NOW,
    })
    const status = settleEntry(entry.id, allResults(projs, ['higher', 'lower', 'higher']), NOW)
    expect(status).toBe('lost')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(before - 4_000)
  })
})

describe('settleEntry — FLEX partial through core', () => {
  it('3 of 4 pays the reduced multiple', () => {
    const p = anyPlayer()
    const a = p.account
    const before = a.balance
    const projs = distinctProjections(4)
    const entry = placeEntry({
      account: a,
      playerName: p.name,
      mode: 'flex',
      picks: entryOf(projs, ['higher', 'higher', 'higher', 'higher']),
      stakeCents: 5_000,
      now: NOW,
    })
    const status = settleEntry(
      entry.id,
      allResults(projs, ['higher', 'higher', 'higher', 'lower']),
      NOW,
    )
    expect(status).toBe('won')
    expect(a.balance).toBe(before + Math.round(5_000 * (1.5 - 1))) // 4-pick flex, 3 correct → 1.5x
    expect(getEntries().find((e) => e.id === entry.id)!.returnCents).toBe(7_500)
  })
})

describe('settleEntry — a void returns the stake', () => {
  it('voids the entry and leaves the figure unchanged when too few legs survive', () => {
    const p = anyPlayer()
    const a = p.account
    const before = a.balance
    const projs = distinctProjections(3)
    const entry = placeEntry({
      account: a,
      playerName: p.name,
      mode: 'power',
      picks: entryOf(projs, ['higher', 'higher', 'higher']),
      stakeCents: 6_000,
      now: NOW,
    })
    const status = settleEntry(entry.id, allResults(projs, ['higher', 'void', 'void']), NOW)
    expect(status).toBe('void')
    expect(a.pending).toBe(0)
    expect(a.balance).toBe(before) // stake returned
    expect(getEntries().find((e) => e.id === entry.id)!.returnCents).toBe(6_000)
  })

  it('resolves the core wager as VOID (not push) so handle/turnover excludes it', () => {
    const p = anyPlayer()
    const a = p.account
    const projs = distinctProjections(3)
    const entry = placeEntry({
      account: a,
      playerName: p.name,
      mode: 'power',
      picks: entryOf(projs, ['higher', 'higher', 'higher']),
      stakeCents: 3_000,
      now: NOW,
    })
    let outcome: string | undefined
    const unsub = onWagerResolved((e) => {
      if (e.wagerId === entry.id) outcome = e.outcome
    })
    settleEntry(entry.id, allResults(projs, ['higher', 'void', 'void']), NOW)
    unsub()
    expect(outcome).toBe('void') // the core ledger records a void, matching entry.status
  })
})

describe('guards', () => {
  it('refuses contradictory picks (same projection twice), placing nothing', () => {
    const p = anyPlayer()
    const a = p.account
    const proj = distinctProjections(1)[0]
    const before = { balance: a.balance, pending: a.pending }
    expect(() =>
      placeEntry({
        account: a,
        playerName: p.name,
        mode: 'power',
        picks: [
          { projection: proj, side: 'higher' },
          { projection: proj, side: 'lower' },
        ],
        stakeCents: 5_000,
        now: NOW,
      }),
    ).toThrow(/same player & stat/i)
    expect(a.pending).toBe(before.pending)
    expect(getEntries()).toHaveLength(0)
  })

  it('refuses fewer than 2 picks and rejects flex below 3', () => {
    const p = anyPlayer()
    const a = p.account
    const projs = distinctProjections(2)
    expect(() =>
      placeEntry({
        account: a,
        playerName: p.name,
        mode: 'power',
        picks: entryOf(projs.slice(0, 1), ['higher']),
        stakeCents: 1_000,
        now: NOW,
      }),
    ).toThrow(/between 2 and 6/i)
    expect(() =>
      placeEntry({
        account: a,
        playerName: p.name,
        mode: 'flex',
        picks: entryOf(projs, ['higher', 'higher']),
        stakeCents: 1_000,
        now: NOW,
      }),
    ).toThrow(/flex needs/i)
  })

  it('refuses a stake beyond availableToWager, placing nothing', () => {
    const p = anyPlayer()
    const a = p.account
    const projs = distinctProjections(3)
    expect(() =>
      placeEntry({
        account: a,
        playerName: p.name,
        mode: 'power',
        picks: entryOf(projs, ['higher', 'higher', 'higher']),
        stakeCents: 5_000_000,
        now: NOW,
      }),
    ).toThrow(/available/i)
    expect(getEntries()).toHaveLength(0)
  })
})

describe('seedDemoEntries — populates the demo through the real money path', () => {
  it('places ALL four samples at full pick count (every projection id exists on the board)', () => {
    const p = anyPlayer()
    const a = p.account
    a.creditLimit = 10_000_000 // headroom so every sample fits regardless of seeded figure
    const seeded = seedDemoEntries(a, p.name, NOW)
    expect(seeded).toBe(4) // none silently dropped — feed ∪ seed covers every spec id
    const mine = entriesForAccount(a.id)
    // pick counts match the specs (4-pick power, 5-pick flex, 3-pick open, 2-pick) — no
    // legs lost to a missing projection
    expect(mine.map((e: PickemEntry) => e.picks.length).sort()).toEqual([2, 3, 4, 5])
    const statuses = new Set(mine.map((e: PickemEntry) => e.status))
    expect(statuses.has('won')).toBe(true)
    expect(statuses.has('lost')).toBe(true)
    expect(statuses.has('open')).toBe(true)
    // a second call is a no-op (already seeded)
    expect(seedDemoEntries(a, p.name, NOW)).toBe(0)
  })
})
