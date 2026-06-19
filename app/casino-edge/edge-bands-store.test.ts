/**
 * The Casino Edge store clamps every set into the game's band, keeps an adjustable game's main
 * edge in the runtime edge-store (so payout follows), and holds per-bet-type / structural edges
 * itself. Agents can't exceed the manager ceiling because every setter routes through the clamp.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { currentEdgeBps, hasEdgeOverride, resetEdgeBps, setEdgeBps } from './edge-bands-store.js'
import { __resetEdgeBands } from './edge-bands-store.js'
import { getRtp, resetRtp } from '../edge-store.js'
import { edgeToBps } from '../game-edge-config.js'

afterEach(() => {
  __resetEdgeBands()
  resetRtp('dice')
  resetRtp('keno')
})

describe('edge-bands-store', () => {
  it('an adjustable game routes its main edge to the runtime edge-store (payout follows)', () => {
    setEdgeBps('dice', edgeToBps(0.03)) // 3% edge → RTP 0.97
    expect(getRtp('dice', 0.99)).toBeCloseTo(0.97, 6)
    expect(currentEdgeBps('dice')).toBe(300)
  })

  it('clamps an out-of-band input to the ceiling (manager/agent can’t exceed it)', () => {
    setEdgeBps('dice', edgeToBps(0.5)) // 50% → dice ceiling 5%
    expect(currentEdgeBps('dice')).toBe(500)
    expect(getRtp('dice', 0.99)).toBeCloseTo(0.95, 6)
  })

  it('clamps a high-edge game up to its floor', () => {
    setEdgeBps('keno', edgeToBps(0.02)) // 2% → keno floor 15%
    expect(currentEdgeBps('keno')).toBe(1500)
  })

  it('holds a per-bet-type override separately and clamps it to the bet-type band', () => {
    setEdgeBps('sicbo', edgeToBps(0.5), 'triple') // → 30% triple ceiling
    expect(currentEdgeBps('sicbo', 'triple')).toBe(3000)
    setEdgeBps('sicbo', edgeToBps(0.5), 'even-money') // → 2.5% even-money ceiling
    expect(currentEdgeBps('sicbo', 'even-money')).toBe(250)
    // the two bet types are independent
    expect(currentEdgeBps('sicbo', 'triple')).toBe(3000)
  })

  it('defaults to the band default with no override, and reset returns to it', () => {
    expect(hasEdgeOverride('sicbo', 'triple')).toBe(false)
    expect(currentEdgeBps('sicbo', 'triple')).toBe(2778) // band default
    setEdgeBps('sicbo', 1500, 'triple')
    expect(hasEdgeOverride('sicbo', 'triple')).toBe(true)
    resetEdgeBps('sicbo', 'triple')
    expect(hasEdgeOverride('sicbo', 'triple')).toBe(false)
    expect(currentEdgeBps('sicbo', 'triple')).toBe(2778)
  })
})
