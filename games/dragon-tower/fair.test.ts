import { describe, it, expect } from 'vitest'
import { deriveTower, isSkull, verifyTower } from './fair.js'
import { DIFFICULTIES, ROWS, badTiles, DIFFICULTY_ORDER } from './difficulty.js'

const SEEDS = ['srv-seed', 'client', 7] as const

describe('deriveTower', () => {
  it('lays out one row per level with the right skull count and valid indices', () => {
    for (const d of DIFFICULTY_ORDER) {
      const layout = deriveTower(...SEEDS, d)
      expect(layout).toHaveLength(ROWS)
      const { tiles } = DIFFICULTIES[d]
      for (const row of layout) {
        expect(row).toHaveLength(badTiles(d))
        expect(new Set(row).size).toBe(row.length) // distinct
        for (const tile of row) expect(tile).toBeGreaterThanOrEqual(0)
        for (const tile of row) expect(tile).toBeLessThan(tiles)
      }
    }
  })

  it('always leaves at least one egg per row', () => {
    for (const d of DIFFICULTY_ORDER) {
      const layout = deriveTower(...SEEDS, d)
      const { tiles } = DIFFICULTIES[d]
      for (const row of layout) expect(row.length).toBeLessThan(tiles)
    }
  })

  it('is deterministic in the seeds', () => {
    expect(deriveTower('a', 'b', 1, 'master')).toEqual(deriveTower('a', 'b', 1, 'master'))
  })

  it('changes when the nonce changes', () => {
    expect(deriveTower('a', 'b', 1, 'master')).not.toEqual(deriveTower('a', 'b', 2, 'master'))
  })
})

describe('verifyTower', () => {
  it('confirms a layout derived from the same seeds', () => {
    const layout = deriveTower(...SEEDS, 'expert')
    expect(verifyTower(...SEEDS, 'expert', layout)).toBe(true)
  })

  it('rejects a tampered layout', () => {
    const layout = deriveTower(...SEEDS, 'hard')
    const tampered = layout.map((row, r) => (r === 0 ? [(row[0] + 1) % 2] : row))
    expect(verifyTower(...SEEDS, 'hard', tampered)).toBe(false)
  })
})

describe('isSkull', () => {
  it('reads the layout grid', () => {
    const layout = [[1], [0]]
    expect(isSkull(layout, 0, 1)).toBe(true)
    expect(isSkull(layout, 0, 0)).toBe(false)
    expect(isSkull(layout, 1, 0)).toBe(true)
  })
})
