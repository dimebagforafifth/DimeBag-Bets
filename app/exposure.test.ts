import { describe, it, expect } from 'vitest'
import { placeWager, resolveWager, type Account } from '../core/index.js'
import { setActiveGame } from './ledger-store.js'
import { getExposureByGame, totalOpenExposure } from './exposure.js'

const acct = (): Account => ({ id: 'x', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('live exposure by game', () => {
  it('adds open stake to the active game, removes it on resolve (by PLACE-time game)', () => {
    const a = acct()
    setActiveGame('dice', 'Dice')
    const w1 = placeWager(a, 1000)
    setActiveGame('mines', 'Mines')
    const w2 = placeWager(a, 500)

    let exp = getExposureByGame()
    expect(exp.find((g) => g.key === 'dice')?.open).toBe(1000)
    expect(exp.find((g) => g.key === 'mines')?.open).toBe(500)
    expect(totalOpenExposure()).toBe(1500)

    // resolve the dice bet while a DIFFERENT game is active — dice must still decrement
    setActiveGame('sportsbook', 'Sportsbook')
    resolveWager(a, w1, 'loss')
    exp = getExposureByGame()
    expect(exp.find((g) => g.key === 'dice')).toBeUndefined() // back to 0 → dropped
    expect(exp.find((g) => g.key === 'mines')?.open).toBe(500) // untouched

    resolveWager(a, w2, 'win', 2)
    expect(getExposureByGame().find((g) => g.key === 'mines')).toBeUndefined()
    setActiveGame('casino', 'Casino') // reset for other tests
  })
})
