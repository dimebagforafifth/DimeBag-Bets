/**
 * The simulate control drives the FULL flow end-to-end through the real money path:
 * place sample bets across players (holding pending), then advance to settlement
 * (moving figures). Nothing cosmetic — it exercises bet → activity → figures.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getBook } from '../book-store.js'
import { resetBookOdds } from './odds-source.js'
import { __resetBets, getBets, openBets } from './bets-store.js'
import { __resetPlacement } from './placement.js'
import { placeSampleBets, settleOpenBets } from './simulate.js'

const NOW = 1_750_000_000_000

beforeEach(() => {
  __resetBets()
  __resetPlacement()
  resetBookOdds()
  for (const m of Object.values(getBook().members)) m.account.pending = 0
})

describe('simulate betting', () => {
  it('places sample bets across players and holds their stakes', () => {
    const placed = placeSampleBets(NOW)
    expect(placed.length).toBeGreaterThan(0)
    expect(getBets().length).toBe(placed.length)
    // each sample player with a bet has a live hold
    const withHold = ['p-marco', 'p-lena', 'p-tariq', 'p-priya'].filter(
      (id) => getBook().members[id].account.pending > 0,
    )
    expect(withHold.length).toBeGreaterThan(0)
  })

  it('advances open bets through to settlement, moving figures', () => {
    placeSampleBets(NOW)
    const before = getBook().members['p-marco'].account.balance
    const n = settleOpenBets(NOW, 'win')
    expect(n).toBeGreaterThan(0)
    expect(openBets(getBets())).toHaveLength(0) // nothing left open
    // every hold released
    const stillHeld = Object.values(getBook().members).filter((m) => m.account.pending !== 0)
    expect(stillHeld).toHaveLength(0)
    // Marco's figure rose on his winning bet
    expect(getBook().members['p-marco'].account.balance).toBeGreaterThan(before)
  })

  it('a loss settlement takes the stake from the figure', () => {
    placeSampleBets(NOW)
    const before = getBook().members['p-marco'].account.balance
    settleOpenBets(NOW, 'loss')
    expect(getBook().members['p-marco'].account.balance).toBeLessThan(before)
  })
})
