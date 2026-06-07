import { describe, it, expect } from 'vitest'
import { derivePops, verifyPops } from './fair.js'
import { CELLS, DIFFICULTIES, DIFFICULTY_ORDER } from './multiplier.js'

const SEEDS = ['srv-seed', 'client', 5] as const

describe('derivePops', () => {
  it('places the right number of distinct, in-range pops', () => {
    for (const d of DIFFICULTY_ORDER) {
      const pops = derivePops(...SEEDS, d)
      expect(pops).toHaveLength(DIFFICULTIES[d].pops)
      expect(new Set(pops).size).toBe(pops.length)
      for (const p of pops) expect(p).toBeGreaterThanOrEqual(0)
      for (const p of pops) expect(p).toBeLessThan(CELLS)
    }
  })

  it('returns positions sorted ascending', () => {
    const pops = derivePops(...SEEDS, 'expert')
    expect([...pops]).toEqual([...pops].sort((a, b) => a - b))
  })

  it('is deterministic in the seeds', () => {
    expect(derivePops('a', 'b', 1, 'hard')).toEqual(derivePops('a', 'b', 1, 'hard'))
  })

  it('changes when the nonce changes', () => {
    expect(derivePops('a', 'b', 1, 'hard')).not.toEqual(derivePops('a', 'b', 2, 'hard'))
  })
})

describe('verifyPops', () => {
  it('confirms a set derived from the same seeds', () => {
    const pops = derivePops(...SEEDS, 'medium')
    expect(verifyPops(...SEEDS, 'medium', pops)).toBe(true)
  })

  it('rejects a tampered set', () => {
    const pops = derivePops(...SEEDS, 'medium')
    const tampered = [...pops]
    tampered[0] = (tampered[0] + 1) % CELLS
    expect(verifyPops(...SEEDS, 'medium', tampered)).toBe(false)
  })
})
