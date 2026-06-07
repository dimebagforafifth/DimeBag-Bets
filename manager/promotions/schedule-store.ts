/**
 * The scheduled-bonus store — persisted upcoming/recurring bonuses. Factory is
 * testable with an injected doc + clock; the singleton persists under the shared
 * 'dimebag' namespace. Firing is done by the runner (schedule-runner.ts); this just
 * holds the schedule and advances it.
 */

import { createLocalStore, persistedDoc } from '../../persistence/index.js'
import type { BonusDraft } from './promotions.js'
import { nextFireAt, type Recurrence, type ScheduledBonus } from './schedule.js'

export interface ScheduleDoc {
  seq: number
  schedules: ScheduledBonus[]
}

export interface DocLike<T> {
  load(): T
  save(value: T): void
}

export interface ScheduleStore {
  /** All schedules, newest first (stable ref). */
  schedules(): ScheduledBonus[]
  add(draft: BonusDraft, fireAt: number, recurrence: Recurrence): ScheduledBonus
  cancel(id: number): void
  /** Record a fire at `now`: advance recurring (skipping missed windows), deactivate 'once'. */
  markFired(id: number, now: number): void
  subscribe(listener: () => void): () => void
  version(): number
}

export function createScheduleStore(doc: DocLike<ScheduleDoc>, now: () => number = () => Date.now()): ScheduleStore {
  const state = doc.load()
  const listeners = new Set<() => void>()
  let version = 0
  const find = (id: number) => state.schedules.find((s) => s.id === id)
  const save = (): void => {
    doc.save(state)
    version += 1
    for (const l of listeners) l()
  }

  return {
    schedules: () => state.schedules,

    add(draft, fireAt, recurrence) {
      const s: ScheduledBonus = {
        id: (state.seq += 1),
        draft,
        fireAt,
        recurrence,
        active: true,
        lastFired: 0,
        createdAt: now(),
      }
      state.schedules.unshift(s)
      save()
      return s
    },

    cancel(id) {
      const s = find(id)
      if (s && s.active) {
        s.active = false
        save()
      }
    },

    markFired(id, t) {
      const s = find(id)
      if (!s) return
      s.lastFired = t
      // advance to the next future occurrence (skip any windows missed while closed)
      let next = nextFireAt(s.fireAt, s.recurrence)
      while (next > 0 && next <= t) next = nextFireAt(next, s.recurrence)
      if (next > 0) s.fireAt = next
      else s.active = false
      save()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    version: () => version,
  }
}

const kv = createLocalStore({ namespace: 'dimebag' })
const doc = persistedDoc<ScheduleDoc>(kv, 'manager.schedules', { version: 1, initial: { seq: 0, schedules: [] } })

/** The live, persisted schedule store. */
export const scheduleStore = createScheduleStore(doc)
