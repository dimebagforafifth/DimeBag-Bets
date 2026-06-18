import { describe, expect, it } from 'vitest'
import type { Account } from '../../core/index.js'
import { createFairnessClient } from '../shared/fair.js'
import { createPumpGame, DIFFICULTIES, verifyPops } from './index.js'

const offline = (() => {
  throw new Error('offline')
}) as unknown as typeof fetch
const account = (): Account => ({ id: 'a', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('pump — server seed comes from the fairness authority', () => {
  it('commits the pops with an authority-minted seed; the layout verifies from the reveal', async () => {
    const client = createFairnessClient({ fetchImpl: offline })
    const minted = await client.mintRound()
    const game = createPumpGame(account(), {
      stake: 1000,
      difficulty: 'medium',
      clientSeed: 'player',
      nonce: 1,
      serverSeed: minted.serverSeed,
    })
    expect(game.serverSeed).toBe(minted.serverSeed)
    expect(game.serverSeedHash).toBe(minted.serverSeedHash)
    expect(
      verifyPops(game.serverSeed, game.clientSeed, game.nonce, game.difficulty, game.popPositions),
    ).toBe(true)
    expect(game.popPositions.length).toBe(DIFFICULTIES.medium.pops)
  })
})
