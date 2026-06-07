import { describe, it, expect } from 'vitest'
import { isAdjustable, nativeEdge, nativeRtp, houseConfigFor } from './edge-config.js'

const ADJUSTABLE = [
  'dice', 'mines', 'crash', 'limbo', 'keno', 'wheel', 'hilo', 'chickenroad',
  'dragon-tower', 'pump', 'coinflip', 'diamonds', 'cases', 'slots', 'plinko',
]
const STRUCTURAL = ['roulette', 'blackjack', 'baccarat', 'sicbo', 'threecardpoker', 'videopoker']

describe('edge-config adapter', () => {
  it('flags the 15 adjustable games and excludes the structural ones', () => {
    for (const k of ADJUSTABLE) expect(isAdjustable(k)).toBe(true)
    for (const k of STRUCTURAL) expect(isAdjustable(k)).toBe(false)
  })

  it('reports native RTP from each game\'s live default', () => {
    expect(nativeRtp('dice')).toBeCloseTo(0.99, 10) // 1% edge
    expect(nativeRtp('mines')).toBeCloseTo(0.99, 10)
    expect(nativeRtp('chickenroad')).toBeCloseTo(0.98, 10) // 2% edge
    expect(nativeRtp('pump')).toBeCloseTo(0.98, 10)
    expect(nativeEdge('roulette')).toBe(0) // not adjustable → 0
  })

  it('builds the right config shape with edge = 1 − RTP per game', () => {
    expect(houseConfigFor('dice', 0.95)).toEqual({ edge: expect.closeTo(0.05, 10) })
    // Mines keeps its rounding sibling; edge lands in houseEdge.
    const mines = houseConfigFor('mines', 0.95)!
    expect(mines.houseEdge).toBeCloseTo(0.05, 10)
    expect(mines.rounding).toBe('floor2')
    // Crash/Limbo set baseEdge and zero the spread.
    const crash = houseConfigFor('crash', 0.97)!
    expect(crash.baseEdge).toBeCloseTo(0.03, 10)
    expect(crash.spread).toBe(0)
  })

  it('returns null for non-adjustable games', () => {
    expect(houseConfigFor('roulette', 0.95)).toBeNull()
    expect(houseConfigFor('blackjack', 0.95)).toBeNull()
  })
})
