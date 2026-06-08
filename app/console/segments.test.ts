import { describe, it, expect } from 'vitest'
import type { PlayerActivity } from '../../manager/reporting/index.js'
import { classify, NEW_DAYS, DORMANT_DAYS } from './segments.js'

const DAY = 86_400_000
const NOW = 1_000 * DAY // a fixed, large epoch so subtractions stay positive

const activity = (firstAgoDays: number, lastAgoDays: number): PlayerActivity => ({
  accountId: 'p1',
  bets: 5,
  turnover: 1000,
  net: 0,
  bonus: 0,
  firstActive: NOW - firstAgoDays * DAY,
  lastActive: NOW - lastAgoDays * DAY,
})

describe('segments.classify', () => {
  it('VIP status wins regardless of recency', () => {
    expect(classify(activity(100, 100), NOW, true)).toBe('vip')
    expect(classify(activity(1, 0), NOW, true)).toBe('vip')
  })

  it('a recently-joined player is new', () => {
    expect(classify(activity(NEW_DAYS - 1, 0), NOW, false)).toBe('new')
  })

  it('a long-inactive player is dormant', () => {
    expect(classify(activity(100, DORMANT_DAYS + 1), NOW, false)).toBe('dormant')
  })

  it('an established, still-active player is casual', () => {
    expect(classify(activity(100, 1), NOW, false)).toBe('casual')
  })
})
