/**
 * Head-to-head — a pure comparison. Each row's values are exactly the two players' own
 * projections (so H2H reconciles to each individual profile), the leader is marked per metric,
 * and the scoreline tallies the wins.
 */

import { describe, expect, it } from 'vitest'
import { compareHeadToHead } from './head-to-head.js'
import { mkStats } from './testkit.js'

const a = mkStats('a', {
  name: 'Ava',
  lifetime: { net: 5000, roi: 0.2, wins: 6, losses: 4, winRate: 60, bets: 10 },
  units: 4,
  biggestWinProfit: 3000,
})
const b = mkStats('b', {
  name: 'Ben',
  lifetime: { net: -1000, roi: -0.05, wins: 5, losses: 5, winRate: 50, bets: 10 },
  units: -1,
  biggestWinProfit: 2000,
})

describe('compareHeadToHead', () => {
  const h2h = compareHeadToHead(a, b, 'lifetime')

  it('uses each player’s own projection values verbatim', () => {
    const net = h2h.rows.find((r) => r.key === 'net')!
    expect(net.a).toBe(a.lifetime.net)
    expect(net.b).toBe(b.lifetime.net)
    const units = h2h.rows.find((r) => r.key === 'units')!
    expect(units.a).toBe(a.units)
    expect(units.b).toBe(b.units)
  })

  it('marks the leader per metric and tallies the scoreline', () => {
    const leader = (key: string) => h2h.rows.find((r) => r.key === key)!.leader
    expect(leader('net')).toBe('a')
    expect(leader('roi')).toBe('a')
    expect(leader('winRate')).toBe('a')
    expect(leader('units')).toBe('a')
    expect(leader('record')).toBe('a') // 6 wins > 5
    expect(leader('bets')).toBe('tie') // 10 == 10
    expect(leader('biggestWin')).toBe('a')
    expect(h2h.score).toEqual({ a: 6, b: 0, ties: 1 })
  })

  it('breaks a record tie on fewer losses (equal wins)', () => {
    const x = mkStats('x', { lifetime: { wins: 5, losses: 3 } })
    const y = mkStats('y', { lifetime: { wins: 5, losses: 5 } })
    const record = compareHeadToHead(x, y, 'lifetime').rows.find((r) => r.key === 'record')!
    expect(record.leader).toBe('a') // same wins, x has fewer losses
  })

  it('compares the chosen window', () => {
    const p = mkStats('p', { lifetime: { net: 100 }, week: { net: 9000 } })
    const q = mkStats('q', { lifetime: { net: 9000 }, week: { net: 100 } })
    expect(compareHeadToHead(p, q, 'week').rows.find((r) => r.key === 'net')!.leader).toBe('a')
    expect(compareHeadToHead(p, q, 'lifetime').rows.find((r) => r.key === 'net')!.leader).toBe('b')
  })
})
