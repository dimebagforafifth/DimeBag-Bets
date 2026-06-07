import { describe, it, expect } from 'vitest'
import type { LedgerEntry as TxEntry } from '../ledger/index.js'
import { byGame, isSportsbook, summarize, toBetRows, type BetRow } from './ledger-stats.js'

/** A durable 'resolve' entry as book-ledger records them (game tag in meta). */
function tx(over: Partial<TxEntry> = {}): TxEntry {
  return {
    seq: 1,
    at: 1000,
    kind: 'resolve',
    accountId: 'p1',
    balanceDelta: 1000,
    pendingDelta: -1000,
    balanceAfter: 1000,
    pendingAfter: 0,
    outcome: 'win',
    multiplier: 2,
    meta: { game: 'mines', gameName: 'Mines', stake: 1000 },
    ...over,
  }
}

describe('toBetRows (durable ledger → bet rows)', () => {
  it('maps a resolve entry to a row, reading the game tag + stake from meta', () => {
    const [row] = toBetRows([tx()])
    expect(row).toEqual<BetRow>({
      id: 1,
      accountId: 'p1',
      gameKey: 'mines',
      game: 'Mines',
      stake: 1000,
      multiplier: 2,
      profit: 1000, // balanceDelta
      outcome: 'win',
      time: 1000,
    })
  })

  it('keeps only resolves, optionally scoped to one account, in order', () => {
    const entries = [
      tx({ seq: 1, accountId: 'p1' }),
      tx({ seq: 2, kind: 'settle', accountId: 'p1' }), // not a graded bet → dropped
      tx({ seq: 3, kind: 'adjust', accountId: 'p1' }), // not a graded bet → dropped
      tx({ seq: 4, accountId: 'p2' }),
    ]
    expect(toBetRows(entries).map((r) => r.id)).toEqual([1, 4]) // resolves only
    expect(toBetRows(entries, 'p1').map((r) => r.id)).toEqual([1]) // scoped to p1
  })

  it('falls back to the released hold for stake, and tolerates missing meta', () => {
    const row = toBetRows([tx({ meta: undefined, pendingDelta: -750 })])[0]
    expect(row.stake).toBe(750) // -pendingDelta when meta.stake is absent
    expect(row.gameKey).toBe('')
    expect(row.game).toBe('Bet')
  })

  it('feeds summarize + byGame correctly off durable entries', () => {
    const rows = toBetRows([
      tx({ seq: 1, meta: { game: 'mines', gameName: 'Mines', stake: 1000 }, balanceDelta: 1000, outcome: 'win', multiplier: 2 }),
      tx({ seq: 2, meta: { game: 'sportsbook', gameName: 'Sportsbook', stake: 1000 }, balanceDelta: -1000, outcome: 'loss', multiplier: 0 }),
    ])
    const s = summarize(rows)
    expect(s).toMatchObject({ bets: 2, wagered: 2000, net: 0, wins: 1, losses: 1, winRate: 50, biggestWin: 1000 })
    expect(byGame(rows).map((g) => g.key).sort()).toEqual(['mines', 'sportsbook'])
    expect(isSportsbook(rows[1])).toBe(true)
  })
})
