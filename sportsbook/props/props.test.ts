import { describe, it, expect } from 'vitest'
import {
  DEFAULT_STAT_SD,
  propOverProbability,
  pricePlayerProp,
  gradePlayerProp,
  SAMPLE_PROPS,
  type PlayerProp,
} from './props.js'

const prop = (over: Partial<PlayerProp> = {}): PlayerProp => ({
  id: 'p',
  eventId: 'e',
  player: 'Tester',
  stat: 'points',
  line: 25,
  projection: 25,
  ...over,
})

describe('propOverProbability', () => {
  it('is 50% when the line equals the projection', () => {
    expect(propOverProbability(prop())).toBeCloseTo(0.5, 6)
  })
  it('favours the over when projection beats the line', () => {
    expect(propOverProbability(prop({ line: 25, projection: 30 }))).toBeGreaterThan(0.5)
  })
  it('uses the stat default sd', () => {
    // projection 25, line 34 (1 sd of points = 9 above) → ~15.9% over
    expect(propOverProbability(prop({ line: 34, projection: 25 }))).toBeCloseTo(0.1586553, 3)
    expect(DEFAULT_STAT_SD.points).toBe(9)
  })
  it('honours a custom sd override', () => {
    const tight = propOverProbability(prop({ line: 30, projection: 25, sd: 3 }))
    const loose = propOverProbability(prop({ line: 30, projection: 25, sd: 12 }))
    expect(tight).toBeLessThan(loose) // a tighter spread makes the over (above proj) rarer
  })
})

describe('pricePlayerProp', () => {
  it('prices both sides with the prop margin', () => {
    const pl = pricePlayerProp(prop(), 0.06)
    expect(pl.over.decimal).toBeCloseTo(pl.under.decimal, 6)
    expect(pl.over.impliedProbability + pl.under.impliedProbability).toBeCloseTo(1.06, 6)
  })
})

describe('gradePlayerProp', () => {
  it('grades against the actual stat', () => {
    const p = prop({ line: 27.5 })
    expect(gradePlayerProp(p, 30, 'over')).toBe('win')
    expect(gradePlayerProp(p, 20, 'over')).toBe('loss')
    expect(gradePlayerProp(p, 20, 'under')).toBe('win')
    expect(gradePlayerProp(prop({ line: 27 }), 27, 'over')).toBe('push')
  })
})

describe('SAMPLE_PROPS', () => {
  it('every sample prop prices and has a known stat sd', () => {
    for (const p of SAMPLE_PROPS) {
      expect(DEFAULT_STAT_SD[p.stat]).toBeGreaterThan(0)
      const pl = pricePlayerProp(p)
      expect(pl.over.decimal).toBeGreaterThan(1)
      expect(pl.under.decimal).toBeGreaterThan(1)
    }
  })
})
