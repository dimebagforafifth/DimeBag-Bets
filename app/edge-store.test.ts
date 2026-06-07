import { describe, it, expect, afterEach } from 'vitest'
import { getRtp, hasOverride, setRtp, resetRtp } from './edge-store.js'

// The store is a module singleton over localStorage; use a unique key per test
// and clean up after, so tests stay independent.
const KEY = 'test-game-edge'
afterEach(() => resetRtp(KEY))

describe('edge-store', () => {
  it('returns the native RTP when there is no override', () => {
    expect(hasOverride(KEY)).toBe(false)
    expect(getRtp(KEY, 0.98)).toBe(0.98)
  })

  it('returns the override once set, and reports it', () => {
    setRtp(KEY, 0.95)
    expect(hasOverride(KEY)).toBe(true)
    expect(getRtp(KEY, 0.98)).toBe(0.95) // override wins over native
  })

  it('clamps to the policy range', () => {
    setRtp(KEY, 0.5) // below floor
    expect(getRtp(KEY, 0.99)).toBe(0.95)
    setRtp(KEY, 1.5) // player-favorable
    expect(getRtp(KEY, 0.99)).toBe(1)
  })

  it('reset removes the override, falling back to native', () => {
    setRtp(KEY, 0.96)
    resetRtp(KEY)
    expect(hasOverride(KEY)).toBe(false)
    expect(getRtp(KEY, 0.99)).toBe(0.99)
  })
})
