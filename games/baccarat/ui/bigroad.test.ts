import { describe, it, expect } from 'vitest'
import { buildBigRoad, type RoadEntry } from './BaccaratGame.js'

const e = (w: 'P' | 'B' | 'T'): RoadEntry => ({
  winner: w === 'P' ? 'player' : w === 'B' ? 'banker' : 'tie',
  playerPair: false,
  bankerPair: false,
})
const road = (s: string): RoadEntry[] => [...s].map((c) => e(c as 'P' | 'B' | 'T'))
/** Compact a column to "B0 B1 P0…" style for readable assertions. */
const cell = (g: ReturnType<typeof buildBigRoad>, col: number, row: number) => g[col]?.[row] ?? null

describe('buildBigRoad — the dragon-tail algorithm', () => {
  it('a same-result streak runs straight down one column', () => {
    const g = buildBigRoad(road('BBB'))
    expect(g.length).toBe(1)
    expect(cell(g, 0, 0)).toEqual({ winner: 'banker', ties: 0 })
    expect(cell(g, 0, 1)).toEqual({ winner: 'banker', ties: 0 })
    expect(cell(g, 0, 2)).toEqual({ winner: 'banker', ties: 0 })
    expect(cell(g, 0, 3)).toBeNull()
  })

  it('a different result starts a new column at row 0', () => {
    const g = buildBigRoad(road('BPB'))
    expect(cell(g, 0, 0)!.winner).toBe('banker')
    expect(cell(g, 1, 0)!.winner).toBe('player')
    expect(cell(g, 2, 0)!.winner).toBe('banker')
    expect(cell(g, 0, 1)).toBeNull()
    expect(cell(g, 1, 1)).toBeNull()
  })

  it('a streak of 7 fills the column then turns right along the bottom row', () => {
    const g = buildBigRoad(road('PPPPPPP'))
    for (let r = 0; r < 6; r++) expect(cell(g, 0, r)!.winner).toBe('player') // col0 rows 0-5
    expect(cell(g, 1, 5)!.winner).toBe('player') // 7th turns to col1, bottom row
    expect(cell(g, 1, 0)).toBeNull()
  })

  it('a streak of 8 keeps tailing right along the bottom row', () => {
    const g = buildBigRoad(road('BBBBBBBB'))
    for (let r = 0; r < 6; r++) expect(cell(g, 0, r)!.winner).toBe('banker')
    expect(cell(g, 1, 5)!.winner).toBe('banker') // 7th
    expect(cell(g, 2, 5)!.winner).toBe('banker') // 8th tails further right, same row
    expect(cell(g, 1, 4)).toBeNull()
  })

  it('a tie slashes the most recent cell without advancing the road', () => {
    const g = buildBigRoad(road('BTB'))
    expect(cell(g, 0, 0)).toEqual({ winner: 'banker', ties: 1 }) // tie annotated the first B
    expect(cell(g, 0, 1)).toEqual({ winner: 'banker', ties: 0 }) // the second B went down
    expect(g.length).toBe(1)
  })

  it('consecutive ties stack on the same cell', () => {
    const g = buildBigRoad(road('PTTT'))
    expect(cell(g, 0, 0)).toEqual({ winner: 'player', ties: 3 })
  })

  it('a leading tie (before any P/B) is skipped', () => {
    const g = buildBigRoad(road('TBB'))
    expect(cell(g, 0, 0)).toEqual({ winner: 'banker', ties: 0 })
    expect(cell(g, 0, 1)).toEqual({ winner: 'banker', ties: 0 })
  })

  it('after a dragon tail, the opposite result starts above the tail (not pushed right)', () => {
    // 7 P's: col0 rows0-5 + a tail at (1,5). The B must begin at (1,0) — directly
    // right of where the P run STARTED — sitting ABOVE the tail, not shoved to col2.
    const g = buildBigRoad(road('PPPPPPPB'))
    expect(cell(g, 1, 5)!.winner).toBe('player') // the P dragon tail
    expect(cell(g, 1, 0)).toEqual({ winner: 'banker', ties: 0 }) // B above it, same column
    expect(cell(g, 2, 0)).toBeNull() // nothing leaked into column 2
  })

  it('subsequent runs after a tail keep their correct columns', () => {
    // 8 P (tail at (1,5),(2,5)), then B, then P. B → (1,0); P → (2,0).
    const g = buildBigRoad(road('PPPPPPPPBP'))
    expect(cell(g, 1, 5)!.winner).toBe('player')
    expect(cell(g, 2, 5)!.winner).toBe('player')
    expect(cell(g, 1, 0)!.winner).toBe('banker')
    expect(cell(g, 2, 0)!.winner).toBe('player')
  })

  it('an empty road yields an empty grid', () => {
    expect(buildBigRoad([])).toEqual([])
  })
})
