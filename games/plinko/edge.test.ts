import { describe, it, expect } from 'vitest'
import { MIN_ROWS, MAX_ROWS, RISKS, payouts, computePlinkoTable, slotProbabilities } from './index.js'

/** Realized RTP of an arbitrary table for the given rows. */
function rtpOfTable(rows: number, table: number[]): number {
  const p = slotProbabilities(rows)
  return table.reduce((acc, m, i) => acc + p[i] * m, 0)
}

describe('computePlinkoTable — Stake numbers at the 99% base, proportional below', () => {
  it('at 99% RTP it is EXACTLY the canonical Stake table (clean numbers preserved)', () => {
    for (let rows = MIN_ROWS; rows <= MAX_ROWS; rows++) {
      for (const risk of RISKS) {
        expect(computePlinkoTable(rows, risk, { edge: 0.01 })).toEqual(payouts(rows, risk))
      }
    }
  })

  it('lowering the RTP scales every multiplier down in proportion', () => {
    const base = payouts(16, 'high')
    const lowered = computePlinkoTable(16, 'high', { edge: 0.05 }) // 95% RTP
    const k = 0.95 / 0.99
    lowered.forEach((m, i) => expect(m).toBeCloseTo(Math.round(base[i] * k * 100) / 100, 9))
    expect(Math.max(...lowered)).toBeLessThan(Math.max(...base))
  })

  it('realized RTP tracks the chosen target across rows × risk', () => {
    for (let rows = MIN_ROWS; rows <= MAX_ROWS; rows++) {
      for (const risk of RISKS) {
        for (const edge of [0.01, 0.03, 0.05]) {
          const rtp = rtpOfTable(rows, computePlinkoTable(rows, risk, { edge }))
          expect(Math.abs(rtp - (1 - edge))).toBeLessThan(0.02)
        }
      }
    }
  })
})
