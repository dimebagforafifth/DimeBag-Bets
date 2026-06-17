import { describe, expect, it } from 'vitest'
import type { Account } from '../../core/index.js'
import { createFairnessClient } from '../shared/fair.js'
import { createTowerGame, verifyTower } from './index.js'

const offline = (() => {
  throw new Error('offline')
}) as unknown as typeof fetch
const account = (): Account => ({ id: 'a', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('dragon-tower — server seed comes from the fairness authority', () => {
  it('commits the tower with an authority-minted seed; the layout verifies from the reveal', async () => {
    const client = createFairnessClient({ fetchImpl: offline })
    const minted = await client.mintRound()
    const game = createTowerGame(account(), {
      stake: 1000,
      difficulty: 'medium',
      clientSeed: 'player',
      nonce: 1,
      serverSeed: minted.serverSeed,
    })
    expect(game.serverSeed).toBe(minted.serverSeed)
    expect(game.serverSeedHash).toBe(minted.serverSeedHash)
    expect(
      verifyTower(game.serverSeed, game.clientSeed, game.nonce, game.difficulty, game.layout),
    ).toBe(true)
  })
})
