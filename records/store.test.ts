import { afterEach, describe, expect, it } from 'vitest'
import { __resetRecords, __setRecordsSeed, getRecord, listProfilePlayers } from './store.js'
import { seededRows } from './seed.js'

const NOW = 1_700_000_000_000

afterEach(() => __resetRecords())

describe('seed — deterministic, varied demo records', () => {
  it('is deterministic for a fixed now', () => {
    expect(JSON.stringify(seededRows('p-lena', NOW))).toBe(
      JSON.stringify(seededRows('p-lena', NOW)),
    )
  })

  it('gives each demo player a distinct, recognisable shape', () => {
    const lena = getRecord('p-lena', NOW)
    const marco = getRecord('p-marco', NOW)
    const dana = getRecord('p-dana', NOW)
    const priya = getRecord('p-priya', NOW)

    expect(lena.lifetime.net).toBeGreaterThan(0) // winner
    expect(marco.lifetime.net).toBeLessThan(0) // losing grinder
    expect(dana.lifetime.wagered).toBeGreaterThan(lena.lifetime.wagered) // whale volume
    expect(dana.tier.current.id).not.toBe('none') // ranked from verified wagered
    expect(lena.streak.currentKind).toBe('win') // riding a hot streak
    expect(priya.clv.available).toBe(true) // sharp sports bettor has CLV
    expect(priya.clv.beatRate).toBeGreaterThan(55)
    expect(lena.biggestWin?.multiplier).toBeGreaterThanOrEqual(24) // the forced big hit
  })

  it('populates the period windows for a high-volume player', () => {
    const dana = getRecord('p-dana', NOW)
    expect(dana.periods.month.bets).toBeGreaterThan(0)
    expect(dana.lifetime.bets).toBeGreaterThanOrEqual(dana.periods.month.bets)
  })
})

describe('store gating', () => {
  it('with seed ON (forced), a demo player has fabricated rows', () => {
    __setRecordsSeed(true)
    const dana = getRecord('p-dana', NOW)
    expect(dana.lifetime.bets).toBeGreaterThan(0)
    expect(dana.integrity.demoSeeded).toBe(true)
  })

  it('with seed OFF, a demo player has an empty real record (no fabricated rows)', () => {
    __setRecordsSeed(false)
    const dana = getRecord('p-dana', NOW)
    expect(dana.lifetime.bets).toBe(0)
    expect(dana.integrity.demoSeeded).toBe(false)
  })

  it('listProfilePlayers includes the seeded demo players', () => {
    const ids = listProfilePlayers().map((p) => p.id)
    expect(ids).toEqual(
      expect.arrayContaining(['p-marco', 'p-lena', 'p-tariq', 'p-priya', 'p-dana']),
    )
  })
})
