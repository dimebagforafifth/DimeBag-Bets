import { describe, expect, it } from 'vitest'
import type { Account } from '../../core/index.js'
import { createFairnessClient } from '../shared/fair.js'
import { createMinesGame, TOTAL_TILES, verifyMines } from './index.js'

const offline = (() => {
  throw new Error('offline')
}) as unknown as typeof fetch
const account = (): Account => ({ id: 'a', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('mines — server seed comes from the fairness authority', () => {
  it('commits the board with an authority-minted seed; the layout verifies from the reveal', async () => {
    const client = createFairnessClient({ fetchImpl: offline })
    const minted = await client.mintRound()
    const game = createMinesGame(account(), {
      stake: 1000,
      mineCount: 5,
      clientSeed: 'player',
      nonce: 1,
      serverSeed: minted.serverSeed,
    })
    expect(game.serverSeed).toBe(minted.serverSeed)
    expect(game.serverSeedHash).toBe(minted.serverSeedHash)
    expect(
      verifyMines(game.serverSeed, game.clientSeed, game.nonce, game.mineCount, game.mines),
    ).toBe(true)
    expect(game.mines.length).toBe(5)
    expect(TOTAL_TILES).toBe(25)
  })
})
