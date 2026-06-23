import { describe, it, expect } from 'vitest'
import { prizeForPosition, rankEntries, standings, isLive, hasEnded } from './tournaments.js'
import type { TournamentDef } from './types.js'

const def: TournamentDef = {
  id: 't', name: 'Cup', metric: 'wagered', startsAt: 0, endsAt: 1000,
  prizePoolCents: 10_000, payoutPct: [0.5, 0.3, 0.2], enabled: true,
}

describe('tournaments', () => {
  it('ranks by score desc with a deterministic tiebreak', () => {
    const ranked = rankEntries([
      { id: 'b', name: 'B', score: 100 },
      { id: 'a', name: 'A', score: 300 },
      { id: 'c', name: 'C', score: 100 },
    ])
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b', 'c']) // 300, then 100/100 → id asc
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3])
  })

  it('splits the pool by configured percentages (floored)', () => {
    expect(prizeForPosition(1, def)).toBe(5000)
    expect(prizeForPosition(2, def)).toBe(3000)
    expect(prizeForPosition(3, def)).toBe(2000)
    expect(prizeForPosition(4, def)).toBe(0) // out of the money
  })

  it('attaches prizes to the standings', () => {
    const s = standings([{ id: 'a', name: 'A', score: 9 }, { id: 'b', name: 'B', score: 1 }], def)
    expect(s[0]).toMatchObject({ position: 1, id: 'a', prizeCents: 5000 })
    expect(s[1]).toMatchObject({ position: 2, id: 'b', prizeCents: 3000 })
  })

  it('knows its window', () => {
    expect(isLive(def, 500)).toBe(true)
    expect(isLive(def, 1500)).toBe(false)
    expect(hasEnded(def, 1000)).toBe(true)
    expect(hasEnded(def, 999)).toBe(false)
  })
})
