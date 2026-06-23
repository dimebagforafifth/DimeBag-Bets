import { describe, it, expect } from 'vitest'
import { pickSegment, probabilities, spin, totalWeight } from './wheel.js'
import { firstFloat } from '../../core/fair.js'
import type { WheelSegment } from './types.js'

const segs: WheelSegment[] = [
  { id: 'a', label: 'A', rewardCents: 0, weight: 1 },
  { id: 'b', label: 'B', rewardCents: 25, weight: 1 },
  { id: 'c', label: 'C', rewardCents: 100, weight: 2 },
]

describe('wheel', () => {
  it('derives probabilities from weights (sum to 1)', () => {
    expect(totalWeight(segs)).toBe(4)
    const p = probabilities(segs)
    expect(p).toEqual([{ id: 'a', p: 0.25 }, { id: 'b', p: 0.25 }, { id: 'c', p: 0.5 }])
  })

  it('maps a roll to the right segment band', () => {
    expect(pickSegment(segs, 0).id).toBe('a') // [0, .25)
    expect(pickSegment(segs, 0.2).id).toBe('a')
    expect(pickSegment(segs, 0.25).id).toBe('b') // [.25, .5)
    expect(pickSegment(segs, 0.5).id).toBe('c') // [.5, 1)
    expect(pickSegment(segs, 0.999).id).toBe('c')
  })

  it('respects the configured probabilities over many provably-fair draws', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 }
    const N = 6000
    for (let nonce = 0; nonce < N; nonce++) {
      counts[spin(segs, 'server-seed', 'client', nonce).id]++
    }
    expect(counts.a / N).toBeCloseTo(0.25, 1) // within ~0.05
    expect(counts.b / N).toBeCloseTo(0.25, 1)
    expect(counts.c / N).toBeCloseTo(0.5, 1)
  })

  it('is verifiable: same seed triple → same segment', () => {
    const f = firstFloat('s', 'c', 7)
    expect(spin(segs, 's', 'c', 7).id).toBe(pickSegment(segs, f).id)
  })
})
