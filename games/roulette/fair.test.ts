import { describe, it, expect } from 'vitest'
import { spinPocket, verifySpin } from './fair.js'
import { POCKETS } from './table.js'

describe('spinPocket', () => {
  it('lands in 0..36, deterministically in the seeds', () => {
    for (let nonce = 1; nonce <= 50; nonce++) {
      const p = spinPocket('rl-server', 'rl-client', nonce)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThan(POCKETS)
      expect(spinPocket('rl-server', 'rl-client', nonce)).toBe(p)
    }
  })

  it('covers the whole wheel across many nonces', () => {
    const seen = new Set<number>()
    for (let nonce = 1; nonce <= 4000; nonce++) seen.add(spinPocket('s', 'c', nonce))
    // every one of 37 pockets should appear with this many draws
    expect(seen.size).toBe(POCKETS)
  })
})

describe('verifySpin', () => {
  it('confirms a genuine pocket and rejects a wrong one', () => {
    const p = spinPocket('s', 'c', 7)
    expect(verifySpin('s', 'c', 7, p)).toBe(true)
    expect(verifySpin('s', 'c', 7, (p + 1) % POCKETS)).toBe(false)
  })
})
