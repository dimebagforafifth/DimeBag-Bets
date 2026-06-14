/**
 * Rewards clock — the time source for cooldowns, streaks and countdowns. In normal use it's
 * just the wall clock; in the demo it carries an OFFSET the dev control can advance (so you
 * can fast-forward 24h to see the daily bonus reset, the streak tick, etc. without waiting).
 *
 * Pure mechanics take `now` as a parameter (deterministic + testable). The UI reads
 * `rewardsNow()`. The offset is persisted so a fast-forwarded demo survives a refresh.
 */
import { createStore, persistedDoc, type Doc } from '../persistence/index.js'

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<{ offsetMs: number }> = persistedDoc<{ offsetMs: number }>(store, 'rewards.clock', {
  version: 1,
  initial: { offsetMs: 0 },
})

let offsetMs = DOC.load()?.offsetMs ?? 0
let version = 0
const listeners = new Set<() => void>()
function notify(): void {
  DOC.save({ offsetMs })
  version += 1
  listeners.forEach((l) => l())
}

/** The current rewards time: wall clock plus any demo fast-forward. */
export function rewardsNow(): number {
  return Date.now() + offsetMs
}

/** Advance the demo clock by `ms` (the dev control fast-forwards time). */
export function advanceDemoClock(ms: number): void {
  if (ms === 0) return
  offsetMs += ms
  notify()
}

/** The current demo fast-forward offset (0 in normal use). */
export function demoOffset(): number {
  return offsetMs
}

/** Reset the demo clock back to real time. */
export function resetDemoClock(): void {
  offsetMs = 0
  notify()
}

export function subscribeClock(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getClockVersion(): number {
  return version
}
