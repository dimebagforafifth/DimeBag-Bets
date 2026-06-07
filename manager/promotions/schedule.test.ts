import { describe, it, expect } from 'vitest'
import { createMemoryStore, persistedDoc } from '../../persistence/index.js'
import { dueSchedules, nextFireAt } from './schedule.js'
import { createScheduleStore, type ScheduleDoc } from './schedule-store.js'
import { runDue } from './schedule-runner.js'
import type { BonusDraft } from './promotions.js'

const DAY = 86_400_000
const draft: BonusDraft = { targetId: 'p1', cents: 1000, type: 'bonus' }

function freshStore(kv = createMemoryStore(), now: () => number = () => 5000) {
  const doc = persistedDoc<ScheduleDoc>(kv, 'sched', { version: 1, initial: { seq: 0, schedules: [] } })
  return { kv, store: createScheduleStore(doc, now) }
}

describe('schedule pure helpers', () => {
  it('nextFireAt steps by recurrence (0 = no repeat)', () => {
    expect(nextFireAt(1000, 'once')).toBe(0)
    expect(nextFireAt(1000, 'daily')).toBe(1000 + DAY)
    expect(nextFireAt(1000, 'weekly')).toBe(1000 + 7 * DAY)
  })
  it('dueSchedules picks active schedules at/before now', () => {
    const list = [
      { id: 1, draft, fireAt: 900, recurrence: 'once' as const, active: true, lastFired: 0, createdAt: 0 },
      { id: 2, draft, fireAt: 2000, recurrence: 'once' as const, active: true, lastFired: 0, createdAt: 0 },
      { id: 3, draft, fireAt: 500, recurrence: 'once' as const, active: false, lastFired: 0, createdAt: 0 },
    ]
    expect(dueSchedules(list, 1000).map((s) => s.id)).toEqual([1])
  })
})

describe('createScheduleStore', () => {
  it('adds (newest first), cancels, and fires', () => {
    const { store } = freshStore()
    const a = store.add(draft, 1000, 'once')
    expect(a.active).toBe(true)
    expect(store.schedules()[0].id).toBe(a.id)
    store.cancel(a.id)
    expect(store.schedules()[0].active).toBe(false)
  })

  it('markFired deactivates a once, advances a recurring past now', () => {
    const { store } = freshStore()
    const once = store.add(draft, 1000, 'once')
    store.markFired(once.id, 1000)
    expect(store.schedules().find((s) => s.id === once.id)?.active).toBe(false)

    const daily = store.add(draft, 1000, 'daily')
    store.markFired(daily.id, 1000 + 3 * DAY) // app was closed ~3 days
    const s = store.schedules().find((x) => x.id === daily.id)!
    expect(s.active).toBe(true)
    expect(s.fireAt).toBeGreaterThan(1000 + 3 * DAY) // skipped missed windows into the future
  })

  it('persists across a reload', () => {
    const kv = createMemoryStore()
    freshStore(kv).store.add(draft, 1000, 'weekly')
    expect(freshStore(kv).store.schedules()).toHaveLength(1)
  })
})

describe('runDue', () => {
  it('fires every due schedule once, advances them, leaves future ones', () => {
    const { store } = freshStore()
    store.add(draft, 1000, 'once') // due
    store.add(draft, 2000, 'daily') // due
    store.add(draft, 9_000_000, 'once') // future
    const sent: BonusDraft[] = []
    const res = runDue(store, 5000, (d) => sent.push(d))
    expect(res).toEqual({ fired: 2, failed: 0 })
    expect(sent).toHaveLength(2)
    const byFuture = store.schedules().find((s) => s.fireAt === 9_000_000)
    expect(byFuture?.active).toBe(true) // untouched
    const daily = store.schedules().find((s) => s.recurrence === 'daily')
    expect(daily?.fireAt).toBeGreaterThan(5000) // advanced
  })

  it('counts a failing target and still advances it (no spin)', () => {
    const { store } = freshStore()
    const s = store.add(draft, 1000, 'once')
    const res = runDue(store, 5000, () => {
      throw new Error('no eligible players')
    })
    expect(res).toEqual({ fired: 0, failed: 1 })
    expect(store.schedules().find((x) => x.id === s.id)?.active).toBe(false) // advanced/deactivated anyway
  })
})
