import { describe, it, expect } from 'vitest'
import { advanceMission, currentProgress, freshProgress, isClaimable, isComplete, periodKey } from './missions.js'
import type { MissionDef } from './types.js'

const DAY = 86_400_000
const daily: MissionDef = {
  id: 'm', title: 'm', description: '', cadence: 'daily', metric: 'bets', target: 3, rewardCents: 50, xp: 10, enabled: true,
}
const t0 = Date.UTC(2026, 5, 7, 12, 0, 0)

describe('missions', () => {
  it('keys periods by day (daily) and week (weekly)', () => {
    expect(periodKey('daily', t0)).not.toBe(periodKey('daily', t0 + DAY))
    expect(periodKey('daily', t0)).toBe(periodKey('daily', t0 + 3600_000)) // same day
    expect(periodKey('weekly', t0)).toBe(periodKey('weekly', t0 + 3600_000)) // same week
    expect(periodKey('weekly', t0)).not.toBe(periodKey('weekly', t0 + 8 * DAY)) // next week
  })

  it('accumulates and completes at the target', () => {
    let p = freshProgress(daily, t0)
    p = advanceMission(p, daily, { bets: 1, wagered: 0, wins: 0 }, t0)
    p = advanceMission(p, daily, { bets: 1, wagered: 0, wins: 0 }, t0)
    expect(isComplete(p)).toBe(false)
    p = advanceMission(p, daily, { bets: 1, wagered: 0, wins: 0 }, t0)
    expect(p.progress).toBe(3)
    expect(isComplete(p)).toBe(true)
    expect(isClaimable(p)).toBe(true)
  })

  it('only counts its own metric', () => {
    let p = freshProgress(daily, t0)
    p = advanceMission(p, daily, { bets: 0, wagered: 5000, wins: 1 }, t0) // no bets → no progress
    expect(p.progress).toBe(0)
  })

  it('refreshes when the period rolls over', () => {
    const p = advanceMission(freshProgress(daily, t0), daily, { bets: 2, wagered: 0, wins: 0 }, t0)
    expect(p.progress).toBe(2)
    const next = currentProgress(p, daily, t0 + DAY) // a new day
    expect(next.progress).toBe(0)
    expect(next.periodKey).toBe(periodKey('daily', t0 + DAY))
  })
})
