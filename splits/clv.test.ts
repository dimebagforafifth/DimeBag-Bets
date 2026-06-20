/**
 * CLV-beat — honestly gated. The closing-line-value beat shows ONLY where closing-line data
 * exists (n/a otherwise, with the records gate's note); the value-vs-taken signal shows only
 * where priced legs exist. The two are independent and never conflated. Pure; no money.
 */

import { describe, expect, it } from 'vitest'
import { clvSummary, type ClvDatum } from '../records/index.js'
import { clvBeat, valueVsTaken, type ValueLeg } from './clv.js'

const clvDatum = (betDecimal: number, closeFairProb: number): ClvDatum => ({
  accountId: 'a',
  betDecimal,
  closeFairProb,
  time: 0,
})

describe('valueVsTaken — value over the de-vigged price taken', () => {
  it('is unavailable (gated) with no priced legs', () => {
    const s = valueVsTaken([])
    expect(s.available).toBe(false)
    expect(s.sampleSize).toBe(0)
    expect(s.note).toBeTruthy()
  })

  it('ignores legs missing or with an out-of-range true probability', () => {
    const legs: ValueLeg[] = [
      { decimal: 2.0 }, // no trueProb
      { decimal: 2.0, trueProb: 0 }, // not in (0,1)
      { decimal: 2.0, trueProb: 1 }, // not in (0,1)
      { decimal: 1.0, trueProb: 0.6 }, // decimal not > 1
    ]
    expect(valueVsTaken(legs).available).toBe(false)
  })

  it('drops a non-finite decimal (a degenerate price) instead of throwing', () => {
    // decimalFromAmerican(0) === Infinity — Infinity > 1 is true, so without a finiteness
    // guard expectedValue would throw. The filter must drop it cleanly.
    const legs: ValueLeg[] = [
      { decimal: Infinity, trueProb: 0.5 },
      { decimal: Number.NaN, trueProb: 0.5 },
    ]
    expect(() => valueVsTaken(legs)).not.toThrow()
    expect(valueVsTaken(legs).available).toBe(false)
  })

  it('scores beat rate and average edge over priced legs', () => {
    const legs: ValueLeg[] = [
      { decimal: 2.0, trueProb: 0.55 }, // edge +0.10 → beat
      { decimal: 2.0, trueProb: 0.45 }, // edge −0.10 → miss
    ]
    const s = valueVsTaken(legs)
    expect(s.available).toBe(true)
    expect(s.sampleSize).toBe(2)
    expect(s.beatRate).toBeCloseTo(50)
    expect(s.avgEdgePct).toBeCloseTo(0) // (+10 −10)/2
  })
})

describe('closing-line-value beat — gated on line data', () => {
  it('is n/a (with a note) when no closing-line data exists', () => {
    const v = clvBeat({ closing: [], legs: [] })
    expect(v.closing.available).toBe(false)
    expect(v.closing.note).toBeTruthy()
  })

  it('lights up where closing-line data exists', () => {
    const data: ClvDatum[] = [clvDatum(2.1, 0.55), clvDatum(1.8, 0.5)]
    const v = clvBeat({ closing: data, legs: [] })
    expect(v.closing.available).toBe(true)
    expect(v.closing.sampleSize).toBe(2)
    // matches the records gate exactly (this consumes the same summary)
    expect(v.closing).toEqual(clvSummary(data))
  })

  it('passes through a pre-summarised closing summary unchanged', () => {
    const summary = clvSummary([clvDatum(2.0, 0.6)])
    expect(clvBeat({ closing: summary, legs: [] }).closing).toEqual(summary)
  })
})

describe('the two signals are independent (never conflated)', () => {
  it('closing can be n/a while value-vs-taken is available, and vice versa', () => {
    const a = clvBeat({ closing: [], legs: [{ decimal: 2.0, trueProb: 0.55 }] })
    expect(a.closing.available).toBe(false)
    expect(a.valueVsTaken.available).toBe(true)

    const b = clvBeat({ closing: [clvDatum(2.0, 0.6)], legs: [] })
    expect(b.closing.available).toBe(true)
    expect(b.valueVsTaken.available).toBe(false)
  })
})
