import { describe, it, expect } from 'vitest'
import { RTP_POLICY, RTP_BOUNDS, rtpToEdge, edgeToRtp, clampRtp } from './edge.js'

describe('RTP policy', () => {
  it('matches the agreed range and anchors', () => {
    expect(RTP_POLICY.MIN).toBe(0.95) // 5% edge cap — RTP can't fall below 95%
    expect(RTP_POLICY.MAX).toBe(1)
    expect(RTP_POLICY.DEFAULT).toBe(0.99)
    expect(RTP_POLICY.WARN_BELOW).toBe(0.97)
    expect(RTP_BOUNDS).toEqual({ min: 0.95, max: 1 })
  })

  it('edge ⇄ rtp round-trips', () => {
    expect(rtpToEdge(0.99)).toBeCloseTo(0.01, 10)
    expect(edgeToRtp(0.02)).toBeCloseTo(0.98, 10)
    expect(edgeToRtp(rtpToEdge(0.955))).toBeCloseTo(0.955, 10)
  })

  it('clamps RTP into [MIN, MAX]', () => {
    expect(clampRtp(0.5)).toBe(0.95) // below floor → floor
    expect(clampRtp(1.5)).toBe(1) // above ceiling (player-favorable) → ceiling
    expect(clampRtp(0.97)).toBe(0.97) // in range → unchanged
    expect(clampRtp(Number.NaN)).toBe(RTP_POLICY.DEFAULT)
  })
})
