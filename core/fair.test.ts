import { describe, it, expect } from 'vitest'
import { uniformSample } from './fair.js'

/** Synthetic generator that yields values from a fixed array then loops. */
function* from(values: number[]): Generator<number, never, unknown> {
  let i = 0
  for (;;) yield values[i++ % values.length]
}

describe('uniformSample', () => {
  it('maps a float to the correct index', () => {
    // pool of 4: indices 0,1,2,3 occupy [0,0.25), [0.25,0.5), [0.5,0.75), [0.75,1)
    expect(uniformSample(from([0.0]), 4)).toBe(0)
    expect(uniformSample(from([0.25]), 4)).toBe(1)
    expect(uniformSample(from([0.5]), 4)).toBe(2)
    expect(uniformSample(from([0.749]), 4)).toBe(2)
    expect(uniformSample(from([0.999]), 4)).toBe(3)
  })

  it('rejects floats in the remainder zone and retries from the stream', () => {
    // pool of 3: threshold = floor(2^32 / 3) * 3 / 2^32 ≈ 0.99999999930
    // With a biased float near 1.0 (above threshold), it should be rejected and
    // the next draw taken. We put 0.9999999999 first, then 0.5 — expect index 1.
    const threshold = (Math.floor(4294967296 / 3) * 3) / 4294967296
    const aboveThreshold = threshold + 1e-15 // just over the limit
    expect(uniformSample(from([aboveThreshold, 0.5]), 3)).toBe(1)
  })

  it('produces uniform-ish coverage with a PRNG stream', () => {
    let seed = 0
    const rng = (function* () {
      for (;;) {
        seed = (seed * 1664525 + 1013904223) % 4294967296
        yield seed / 4294967296
      }
    })()
    const counts = [0, 0, 0, 0, 0]
    const N = 50000
    for (let i = 0; i < N; i++) counts[uniformSample(rng, 5)]++
    // Each bucket should land near N/5 = 10000, well within 5%
    for (const c of counts) expect(Math.abs(c - N / 5)).toBeLessThan(N * 0.05)
  })
})
