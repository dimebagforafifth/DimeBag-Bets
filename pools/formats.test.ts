/**
 * The five format plugins (pure scoring + validation): pick'em, confidence, survivor, bracket,
 * squares. Covers the brief's per-format cases. No money moves here.
 */

import { describe, expect, it } from 'vitest'
import { pickemFormat } from './formats/pickem.js'
import { confidenceFormat } from './formats/confidence.js'
import { survivorFormat } from './formats/survivor.js'
import { bracketFormat } from './formats/bracket.js'
import { squaresFormat, winningSquare } from './formats/squares.js'
import type {
  FormatScoreInput,
  PoolConfig,
  PoolPicks,
  PoolResults,
  ScoredEntry,
} from './formats/types.js'

const e = (accountId: string, name: string, picks: PoolPicks): ScoredEntry => ({
  accountId,
  name,
  picks,
})
const input = (
  config: PoolConfig,
  results: PoolResults,
  entries: ScoredEntry[],
  prizeSplit: number[] = [0.6, 0.3, 0.1],
): FormatScoreInput => ({ config, results, prizeSplit, entries })

/* ------------------------------- pick'em ------------------------------- */
describe("pick'em", () => {
  const config: PoolConfig = {
    kind: 'pickem',
    games: [
      { id: 'g1', label: 'G1', options: ['Home', 'Away'] },
      { id: 'g2', label: 'G2', options: ['Home', 'Away'] },
      { id: 'g3', label: 'G3', options: ['Home', 'Away'] },
    ],
  }
  const results: PoolResults = { kind: 'pickem', winners: { g1: 'Home', g2: 'Away', g3: 'Home' } }

  it('scores correct picks and ranks by count, paying the split', () => {
    const entries = [
      e('a', 'A', { kind: 'pickem', selections: { g1: 'Home', g2: 'Away', g3: 'Home' } }), // 3
      e('b', 'B', { kind: 'pickem', selections: { g1: 'Home', g2: 'Away', g3: 'Away' } }), // 2
      e('c', 'C', { kind: 'pickem', selections: { g1: 'Home', g2: 'Home', g3: 'Away' } }), // 1
    ]
    const s = pickemFormat.standings(input(config, results, entries))
    expect(s.map((r) => [r.accountId, r.points, r.rank])).toEqual([
      ['a', 3, 1],
      ['b', 2, 2],
      ['c', 1, 3],
    ])
    const w = pickemFormat.winners(input(config, results, entries))
    expect(w).toEqual([
      { accountId: 'a', weight: 0.6 },
      { accountId: 'b', weight: 0.3 },
      { accountId: 'c', weight: 0.1 },
    ])
  })

  it('rejects a pick that isn’t one of the two sides', () => {
    expect(() =>
      pickemFormat.validatePicks({ kind: 'pickem', selections: { g1: 'Draw' } }, config),
    ).toThrow()
  })
})

/* ----------------------------- confidence ------------------------------ */
describe('confidence', () => {
  const config: PoolConfig = {
    kind: 'confidence',
    games: [
      { id: 'g1', label: 'G1', options: ['Home', 'Away'] },
      { id: 'g2', label: 'G2', options: ['Home', 'Away'] },
      { id: 'g3', label: 'G3', options: ['Home', 'Away'] },
    ],
  }
  const results: PoolResults = {
    kind: 'confidence',
    winners: { g1: 'Home', g2: 'Home', g3: 'Home' },
  }

  it('weights correct picks by confidence and ranks by total', () => {
    const entries = [
      // A nails the two it was most confident about (3 + 2 = 5)
      e('a', 'A', {
        kind: 'confidence',
        selections: { g1: 'Home', g2: 'Home', g3: 'Away' },
        confidence: { g1: 3, g2: 2, g3: 1 },
      }),
      // B only gets its lowest-confidence pick right (1)
      e('b', 'B', {
        kind: 'confidence',
        selections: { g1: 'Away', g2: 'Away', g3: 'Home' },
        confidence: { g1: 3, g2: 2, g3: 1 },
      }),
    ]
    const s = confidenceFormat.standings(input(config, results, entries))
    expect(s.map((r) => [r.accountId, r.points])).toEqual([
      ['a', 5],
      ['b', 1],
    ])
    expect(s[0].rank).toBe(1)
  })

  it('rejects confidence weights that aren’t a 1..N permutation', () => {
    expect(() =>
      confidenceFormat.validatePicks(
        {
          kind: 'confidence',
          selections: { g1: 'Home', g2: 'Home', g3: 'Home' },
          confidence: { g1: 1, g2: 1, g3: 3 },
        },
        config,
      ),
    ).toThrow(/once/)
  })
})

/* ------------------------------ survivor ------------------------------- */
describe('survivor', () => {
  const config: PoolConfig = { kind: 'survivor', teams: ['T1', 'T2', 'T3', 'T4'], rounds: 3 }

  it('rejects reusing a team across rounds', () => {
    expect(() =>
      survivorFormat.validatePicks({ kind: 'survivor', selections: { 0: 'T1', 1: 'T1' } }, config),
    ).toThrow(/used|repeat/)
  })

  it('eliminates on a losing pick and pays the last one standing', () => {
    const results: PoolResults = {
      kind: 'survivor',
      roundWinners: { 0: ['T1', 'T2', 'T3'], 1: ['T3'] },
    }
    const entries = [
      e('a', 'A', { kind: 'survivor', selections: { 0: 'T1', 1: 'T2' } }), // out R2 (survived 1)
      e('b', 'B', { kind: 'survivor', selections: { 0: 'T1', 1: 'T3' } }), // alive (survived 2)
      e('c', 'C', { kind: 'survivor', selections: { 0: 'T4', 1: 'T1' } }), // out R1 (T4 lost) survived 0
    ]
    const s = survivorFormat.standings(input(config, results, entries))
    expect(s[0].accountId).toBe('b')
    expect(s[0].points).toBe(2)
    expect(s[0].note).toBe('alive')
    expect(s.find((r) => r.accountId === 'a')?.note).toBe('out R2')
    const w = survivorFormat.winners(input(config, results, entries))
    expect(w).toEqual([{ accountId: 'b', weight: 1 }]) // last standing, winner-take-all
  })

  it('pays no one when nobody survives a single round (pot falls to the rake, not the bustees)', () => {
    const results: PoolResults = { kind: 'survivor', roundWinners: { 0: ['T3', 'T4'] } } // T1, T2 lost
    const entries = [
      e('a', 'A', { kind: 'survivor', selections: { 0: 'T1' } }),
      e('b', 'B', { kind: 'survivor', selections: { 0: 'T2' } }),
    ]
    expect(survivorFormat.winners(input(config, results, entries))).toEqual([])
  })

  it('splits evenly when several survive equally long', () => {
    const results: PoolResults = {
      kind: 'survivor',
      roundWinners: { 0: ['T1', 'T2', 'T3'], 1: ['T3'] },
    }
    const entries = [
      e('b', 'B', { kind: 'survivor', selections: { 0: 'T1', 1: 'T3' } }), // survived 2
      e('f', 'F', { kind: 'survivor', selections: { 0: 'T2', 1: 'T3' } }), // survived 2
      e('a', 'A', { kind: 'survivor', selections: { 0: 'T1', 1: 'T2' } }), // survived 1
    ]
    const w = survivorFormat.winners(input(config, results, entries))
    expect(w).toEqual([
      { accountId: 'b', weight: 0.5 },
      { accountId: 'f', weight: 0.5 },
    ])
  })
})

/* ------------------------------- bracket ------------------------------- */
describe('bracket', () => {
  const config: PoolConfig = {
    kind: 'bracket',
    matchups: [
      { id: 'm1', round: 0, teamA: 'Top', seedA: 1, teamB: 'Cinderella', seedB: 8 },
      { id: 'm2', round: 1, teamA: 'Alpha', seedA: 2, teamB: 'Beta', seedB: 3 },
    ],
    pointsPerRound: [1, 2],
    upsetBonus: 1,
  }
  // m1: the 8-seed upsets the 1-seed. m2: the 2-seed (favorite) wins.
  const results: PoolResults = { kind: 'bracket', winners: { m1: 'Cinderella', m2: 'Alpha' } }

  it('scores per round and adds the upset bonus when the underdog was picked', () => {
    const entries = [
      e('a', 'A', { kind: 'bracket', winners: { m1: 'Cinderella', m2: 'Alpha' } }), // 1+1 upset + 2 = 4
      e('b', 'B', { kind: 'bracket', winners: { m1: 'Top', m2: 'Alpha' } }), // m1 wrong, m2 right = 2
    ]
    const s = bracketFormat.standings(input(config, results, entries))
    expect(s[0].accountId).toBe('a')
    expect(s[0].points).toBe(4) // round0 (1) + upset (1) + round1 (2)
    expect(s[1].points).toBe(2) // only round1 favorite
  })
})

/* ------------------------------- squares ------------------------------- */
describe('squares', () => {
  const config: PoolConfig = { kind: 'squares', periods: ['Q1', 'Q2'], periodWeights: [0.4, 0.6] }

  it('maps a score to its grid square (home/away last digit)', () => {
    expect(winningSquare({ home: 17, away: 23 })).toEqual({ row: 7, col: 3 })
    expect(winningSquare({ home: 10, away: 20 })).toEqual({ row: 0, col: 0 })
  })

  it('pays the holder of the winning square each period', () => {
    const entries = [
      e('a', 'A', { kind: 'squares', squares: [{ row: 7, col: 3 }] }),
      e('b', 'B', { kind: 'squares', squares: [{ row: 0, col: 0 }] }),
    ]
    const results: PoolResults = {
      kind: 'squares',
      periodScores: [
        { period: 0, home: 17, away: 23 }, // → (7,3) → A wins Q1 (0.4)
        { period: 1, home: 10, away: 20 }, // → (0,0) → B wins Q2 (0.6)
      ],
    }
    const w = squaresFormat.winners(input(config, results, entries))
    expect(w).toEqual([
      { accountId: 'a', weight: 0.4 },
      { accountId: 'b', weight: 0.6 },
    ])
    const s = squaresFormat.standings(input(config, results, entries))
    expect(s[0].accountId).toBe('b') // more prize weight → ranks first
    expect(s[0].rank).toBe(1)
  })

  it('counts a duplicate/re-posted period once (no double pay → Σ weight stays ≤ 1)', () => {
    const entries = [e('a', 'A', { kind: 'squares', squares: [{ row: 7, col: 3 }] })]
    const results: PoolResults = {
      kind: 'squares',
      periodScores: [
        { period: 0, home: 17, away: 23 },
        { period: 0, home: 17, away: 23 }, // duplicate Q1 — must not double-count
      ],
    }
    expect(squaresFormat.winners(input(config, results, entries))).toEqual([
      { accountId: 'a', weight: 0.4 },
    ])
  })

  it('rejects an out-of-range or duplicate square', () => {
    expect(() =>
      squaresFormat.validatePicks({ kind: 'squares', squares: [{ row: 10, col: 0 }] }, config),
    ).toThrow()
    expect(() =>
      squaresFormat.validatePicks(
        {
          kind: 'squares',
          squares: [
            { row: 1, col: 1 },
            { row: 1, col: 1 },
          ],
        },
        config,
      ),
    ).toThrow()
  })
})
