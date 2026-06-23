import { describe, it, expect } from 'vitest'
import { addPlayer, createOrg, type Org } from '../../features/org/index.js'
import type { AnalyticsRecord } from '../reporting/analytics.js'
import { buildSnapshot } from './snapshot.js'

const DAY = 86_400_000
const NOW = 100 * DAY

function org(): Org {
  const o = createOrg({ name: 'Book', creditLimit: 1_000_000, id: 'mgr' })
  addPlayer(o, 'mgr', { name: 'P1', creditLimit: 100_000, id: 'p1' })
  addPlayer(o, 'mgr', { name: 'P2', creditLimit: 100_000, id: 'p2' })
  return o
}
const rec = (o: Partial<AnalyticsRecord>): AnalyticsRecord => ({
  seq: 1,
  time: NOW - DAY,
  accountId: 'p1',
  gameKey: 'mines',
  game: 'Mines',
  kind: 'wager',
  stake: 1000,
  profit: -1000,
  multiplier: 0,
  outcome: 'loss',
  ...o,
})

describe('buildSnapshot', () => {
  it('composes windowed activity + org read-models', () => {
    const records = [rec({}), rec({ accountId: 'p2', time: NOW - 2 * DAY })]
    const s = buildSnapshot(records, org(), NOW, 7)
    expect(s.players).toBe(2)
    expect(s.activity.bets).toBe(2)
    expect(s.activity.turnover).toBe(2000)
    expect(s.activity.houseGGR).toBe(2000) // both players lost their stake
    expect(s.creditUtilization).toBeGreaterThanOrEqual(0)
    expect(s.creditUtilization).toBeLessThanOrEqual(1)
  })

  it('only counts in-window records for activity', () => {
    const records = [rec({}), rec({ time: NOW - 40 * DAY })] // one recent, one old
    const s = buildSnapshot(records, org(), NOW, 7)
    expect(s.activity.bets).toBe(1) // the 40-day-old bet is outside the 7-day window
  })
})
