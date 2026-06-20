/**
 * Pool standings — a PURE, READ-ONLY projection over a pool's entries + posted results, via the
 * format plugin. It reconciles to the entries/results and NEVER writes a credit (the cardinal
 * rule). The store calls poolWinners only to size payouts; the money itself moves in escrow.ts.
 */

import { formatFor } from './formats/index.js'
import type {
  FormatScoreInput,
  FormatStanding,
  FormatWinner,
  PoolResults,
} from './formats/types.js'
import type { Pool, PoolEntry, PoolKind } from './types.js'

/** An empty results envelope for a kind — lets standings render before any result is posted. */
export function emptyResultsFor(kind: PoolKind): PoolResults {
  switch (kind) {
    case 'pickem':
      return { kind: 'pickem', winners: {} }
    case 'confidence':
      return { kind: 'confidence', winners: {} }
    case 'survivor':
      return { kind: 'survivor', roundWinners: {} }
    case 'bracket':
      return { kind: 'bracket', winners: {} }
    case 'squares':
      return { kind: 'squares', periodScores: [] }
    default:
      throw new Error(`no results shape for "${kind}"`)
  }
}

function scoreInput(pool: Pool, entries: PoolEntry[], results: PoolResults): FormatScoreInput {
  return {
    config: pool.config,
    results,
    prizeSplit: pool.prizeStructure,
    entries: entries
      .filter((e) => e.poolId === pool.id)
      .map((e) => ({ accountId: e.accountId, name: e.playerName, picks: e.picks })),
  }
}

/** Ranked standings for display (live-tolerant: uses posted results, else an empty board). */
export function poolStandings(pool: Pool, entries: PoolEntry[]): FormatStanding[] {
  const results = pool.results ?? emptyResultsFor(pool.kind)
  return formatFor(pool.kind).standings(scoreInput(pool, entries, results))
}

/** Prize-weight winners from the posted results (used to size payouts at settle). */
export function poolWinners(
  pool: Pool,
  entries: PoolEntry[],
  results: PoolResults,
): FormatWinner[] {
  return formatFor(pool.kind).winners(scoreInput(pool, entries, results))
}
