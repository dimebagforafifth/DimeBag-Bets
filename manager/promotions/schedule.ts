/**
 * Scheduled / recurring bonuses (pure model). A schedule holds a bonus draft and a
 * next-fire time; a runner fires due ones through the normal sendBonus path. In a
 * client-only app the runner ticks while the app is open (+ on load) — production
 * scheduling would move to a backend cron; the model + runner here are unchanged by
 * that. This file is pure (types + due-selection + recurrence math).
 */

import type { BonusDraft } from './promotions.js'

export type Recurrence = 'once' | 'daily' | 'weekly'

export interface ScheduledBonus {
  id: number
  /** What to send (target, amount, type, note). */
  draft: BonusDraft
  /** Next time this should fire (epoch ms). */
  fireAt: number
  recurrence: Recurrence
  active: boolean
  /** Epoch ms it last fired (0 = never). */
  lastFired: number
  createdAt: number
}

const DAY = 86_400_000
const WEEK = 7 * DAY

/** The next fire time after one fires (0 = no repeat, i.e. 'once'). Pure. */
export function nextFireAt(fireAt: number, recurrence: Recurrence): number {
  if (recurrence === 'daily') return fireAt + DAY
  if (recurrence === 'weekly') return fireAt + WEEK
  return 0
}

/** Active schedules whose fire time has arrived. Pure. */
export function dueSchedules(list: ScheduledBonus[], now: number): ScheduledBonus[] {
  return list.filter((s) => s.active && s.fireAt <= now)
}
