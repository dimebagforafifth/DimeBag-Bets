import { describe, expect, it } from 'vitest'
import type { Account } from '../../core/index.js'
import { createFairnessClient } from '../shared/fair.js'
import { createHiloGame, verifyHilo } from './index.js'

const offline = (() => {
  throw new Error('offline')
}) as unknown as typeof fetch
const account = (): Account => ({ id: 'a', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('hilo — server seed comes from the fairness authority', () => {
  it('deals the round with an authority-minted seed; the cards verify from the reveal', async () => {
    const client = createFairnessClient({ fetchImpl: offline })
    const minted = await client.mintRound()
    const game = createHiloGame(account(), {
      stake: 1000,
      clientSeed: 'player',
      nonce: 1,
      serverSeed: minted.serverSeed,
    })
    expect(game.serverSeed).toBe(minted.serverSeed)
    expect(game.serverSeedHash).toBe(minted.serverSeedHash)
    expect(verifyHilo(game.serverSeed, game.clientSeed, game.nonce, game.cards)).toBe(true)
  })
})
