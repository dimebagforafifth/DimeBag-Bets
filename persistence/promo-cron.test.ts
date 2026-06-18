/**
 * Scheduled-promos cron worker. Proves the env gate (no keys → mock no-op), the
 * dispatcher gate (keys but no `send` → ran:false, nothing advanced), and the live
 * orchestration (fires DUE bonuses, advances recurring past missed windows, deactivates
 * 'once', persists). An injected in-memory source keeps it offline + deterministic.
 */
import { describe, it, expect } from 'vitest'
import { runScheduledPromosCron, type ScheduleSource } from './promo-cron.js'
import type { ScheduledBonus } from '../manager/promotions/schedule.js'
import type { BonusDraft } from '../manager/promotions/promotions.js'

const DAY = 86_400_000
const DRAFT: BonusDraft = { targetId: 'all', type: 'freeplay', cents: 500 }

function sched(over: Partial<ScheduledBonus>): ScheduledBonus {
  return {
    id: 1,
    draft: DRAFT,
    fireAt: 1000,
    recurrence: 'once',
    active: true,
    lastFired: 0,
    createdAt: 0,
    ...over,
  }
}

/** An in-memory ScheduleSource that records saves. */
function memSource(schedules: ScheduledBonus[]) {
  const doc = { seq: schedules.length, schedules }
  let saves = 0
  const source: ScheduleSource = {
    async load() {
      return doc
    },
    async save(d) {
      saves += 1
      Object.assign(doc, d)
    },
  }
  return { source, doc, saves: () => saves }
}

describe('runScheduledPromosCron', () => {
  it('is a mock no-op with no keys', async () => {
    const r = await runScheduledPromosCron({ envSource: {} })
    expect(r).toMatchObject({ mode: 'mock', ran: false, fired: 0, failed: 0 })
  })

  it('with a source but no dispatcher: ran:false, advances nothing', async () => {
    const { source, doc } = memSource([sched({ fireAt: 100, active: true })])
    const r = await runScheduledPromosCron({ source, now: 1_000_000 })
    expect(r).toMatchObject({ mode: 'live', ran: false })
    expect(doc.schedules[0].active).toBe(true) // untouched — bonus not lost
    expect(doc.schedules[0].lastFired).toBe(0)
  })

  it('fires due bonuses through send and deactivates a one-off', async () => {
    const { source, doc, saves } = memSource([
      sched({ id: 1, fireAt: 100, recurrence: 'once', active: true }),
      sched({ id: 2, fireAt: 5_000_000, recurrence: 'once', active: true }), // not due yet
    ])
    const sent: BonusDraft[] = []
    const r = await runScheduledPromosCron({ source, now: 1_000_000, send: (d) => sent.push(d) })
    expect(r).toMatchObject({ mode: 'live', ran: true, fired: 1, failed: 0 })
    expect(sent).toHaveLength(1)
    expect(doc.schedules[0].active).toBe(false) // 'once' fired → deactivated
    expect(doc.schedules[0].lastFired).toBe(1_000_000)
    expect(doc.schedules[1].active).toBe(true) // future one untouched
    expect(saves()).toBe(1)
  })

  it('re-arms a daily schedule past missed windows', async () => {
    const now = 10 * DAY + 5
    const { source, doc } = memSource([sched({ fireAt: 5, recurrence: 'daily', active: true })])
    const r = await runScheduledPromosCron({ source, now, send: () => {} })
    expect(r.fired).toBe(1)
    expect(doc.schedules[0].active).toBe(true)
    expect(doc.schedules[0].fireAt).toBeGreaterThan(now) // advanced to the next future window
    expect((doc.schedules[0].fireAt - 5) % DAY).toBe(0) // still on the daily cadence
  })

  it('counts a throwing dispatch as failed but still advances (no spin)', async () => {
    const { source, doc } = memSource([sched({ fireAt: 100, recurrence: 'once', active: true })])
    const r = await runScheduledPromosCron({
      source,
      now: 1_000_000,
      send: () => {
        throw new Error('no eligible players')
      },
    })
    expect(r).toMatchObject({ ran: true, fired: 0, failed: 1 })
    expect(doc.schedules[0].active).toBe(false) // advanced despite the failure
  })

  it('does not save when nothing was due', async () => {
    const { source, saves } = memSource([sched({ fireAt: 9_000_000, active: true })])
    const r = await runScheduledPromosCron({ source, now: 1000, send: () => {} })
    expect(r).toMatchObject({ ran: true, fired: 0, failed: 0 })
    expect(saves()).toBe(0)
  })
})
