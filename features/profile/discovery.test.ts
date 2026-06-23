/**
 * Discovery ranking — pure, over an injected projection. Leaderboards rank by the chosen metric
 * with a sample floor on rate metrics; suggestions put friends-of-friends first then fill with
 * top-ROI; follow-by-sport ranks by net in one sport and drops players with no action there.
 */

import { describe, expect, it } from 'vitest'
import { rankBySport, rankPlayers, suggestPlayers } from './discovery.js'
import { mkStats, split } from './testkit.js'

const candidates = [
  { id: 'p1', name: 'P1' },
  { id: 'p2', name: 'P2' },
  { id: 'p3', name: 'P3' },
  { id: 'p4', name: 'P4' },
]

describe('rankPlayers', () => {
  const map = {
    p1: mkStats('p1', { week: { roi: 0.2, decided: 5, net: 4000 }, lifetime: { net: 9000 } }),
    p2: mkStats('p2', { week: { roi: 0.5, decided: 2, net: 1000 }, lifetime: { net: 1000 } }), // below floor
    p3: mkStats('p3', { week: { roi: 0.1, decided: 10, net: 2000 }, lifetime: { net: 30000 } }),
    p4: mkStats('p4', { week: { roi: -0.3, decided: 8, net: -3000 }, lifetime: { net: -500 } }),
  }
  const statsOf = (id: string) => map[id as keyof typeof map]

  it('ranks by ROI and excludes players below the decided-bet floor', () => {
    const ranked = rankPlayers(candidates, statsOf, {
      metric: 'roi',
      window: 'week',
      minDecided: 3,
    })
    expect(ranked.map((r) => r.id)).toEqual(['p1', 'p3', 'p4']) // p2 dropped (2 < 3 decided)
    expect(ranked[0].rank).toBe(1)
  })

  it('ranks by net with no floor (absolute, all qualify)', () => {
    const ranked = rankPlayers(candidates, statsOf, { metric: 'net', window: 'lifetime' })
    expect(ranked.map((r) => r.id)).toEqual(['p3', 'p1', 'p2', 'p4'])
  })

  it('honours the limit', () => {
    const ranked = rankPlayers(candidates, statsOf, { metric: 'net', window: 'lifetime', limit: 2 })
    expect(ranked.map((r) => r.id)).toEqual(['p3', 'p1'])
  })
})

describe('suggestPlayers', () => {
  const map = {
    p1: mkStats('p1', { week: { roi: 0.9, decided: 9, net: 9000 } }),
    p2: mkStats('p2', { week: { roi: 0.4, decided: 9, net: 4000 } }),
    p3: mkStats('p3', { week: { roi: 0.1, decided: 9, net: 1000 } }),
    p4: mkStats('p4', { week: { roi: 0.6, decided: 9, net: 6000 } }),
  }
  const statsOf = (id: string) => map[id as keyof typeof map]

  it('lists friends-of-friends first, then fills with top-ROI, excluding the excluded set', () => {
    const out = suggestPlayers({
      candidates,
      statsOf,
      fof: [
        { id: 'p3', mutuals: 2 },
        { id: 'p1', mutuals: 5 }, // excluded below (already followed)
      ],
      exclude: new Set(['viewer', 'p1']),
      limit: 3,
    })
    expect(out[0]).toMatchObject({ id: 'p3', reason: 'friends-of-friends', detail: '2 mutuals' })
    // fill: top-ROI among remaining (p1 excluded, p3 taken) → p4 (0.6) before p2 (0.4)
    expect(out.slice(1).map((s) => s.id)).toEqual(['p4', 'p2'])
    expect(out.every((s) => s.id !== 'p1')).toBe(true)
  })
})

describe('rankBySport', () => {
  const map = {
    p1: mkStats('p1', { bySport: [split('BASKETBALL', 'Basketball', 500)] }),
    p2: mkStats('p2', { bySport: [split('BASKETBALL', 'Basketball', 1000)] }),
    p3: mkStats('p3', { bySport: [split('FOOTBALL', 'Football', 9999)] }), // no basketball
  }
  const statsOf = (id: string) => map[id as keyof typeof map]

  it('ranks by net in the chosen sport and drops players with no action there', () => {
    const ranked = rankBySport(candidates.slice(0, 3), statsOf, 'BASKETBALL')
    expect(ranked.map((r) => r.id)).toEqual(['p2', 'p1'])
    expect(ranked.find((r) => r.id === 'p3')).toBeUndefined()
  })
})
