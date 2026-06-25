/**
 * The schedule runner — fires due scheduled bonuses through the normal sendBonus
 * path. `runDue` is pure-ish + injectable (store, clock, send) for tests. The
 * singleton runner ticks once a minute (and once on start) while the app is open;
 * the shell can call `startScheduleRunner()` at boot. In a client-only app a
 * schedule fires only while a tab is open — production scheduling would move to a
 * backend cron (the model is unchanged). No-op under test (no dangling interval).
 */

import type { BonusDraft } from './promotions.js'
import { dueSchedules } from './schedule.js'
import { scheduleStore, type ScheduleStore } from './schedule-store.js'
import { sendBonus } from './send.js'
import { readEnv } from '../../lib/env.js'

export interface RunResult {
  fired: number
  failed: number
}

/** Fire every due schedule once and advance it. A failing target (e.g. a target
 *  that now has no eligible players) is counted and still advanced, so it can't spin
 *  the runner. */
export function runDue(store: ScheduleStore, now: number, send: (d: BonusDraft) => void): RunResult {
  let fired = 0
  let failed = 0
  for (const s of dueSchedules(store.schedules(), now)) {
    try {
      send(s.draft)
      fired += 1
    } catch {
      failed += 1
    }
    store.markFired(s.id, now)
  }
  return { fired, failed }
}

function inTest(): boolean {
  return readEnv('VITEST') === 'true'
}

let timer: ReturnType<typeof setInterval> | null = null

/** Start the live runner against the singleton store (idempotent; no-op in tests). */
export function startScheduleRunner(): void {
  if (timer || inTest() || typeof setInterval === 'undefined') return
  const tick = (): void => {
    runDue(scheduleStore, Date.now(), (d) => {
      sendBonus(d)
    })
  }
  tick() // catch up on load
  timer = setInterval(tick, 60_000)
}

startScheduleRunner()
