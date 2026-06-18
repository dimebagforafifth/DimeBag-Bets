import { describe, expect, it } from 'vitest'
import type { Account } from '../../core/index.js'
import { createFairnessClient } from '../shared/fair.js'
import { createBlackjackGame, verifyShoe } from './index.js'

const offline = (() => {
  throw new Error('offline')
}) as unknown as typeof fetch
const account = (): Account => ({ id: 'a', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('blackjack — server seed comes from the fairness authority', () => {
  it('shuffles the shoe with an authority-minted seed; the deck verifies from the reveal', async () => {
    const client = createFairnessClient({ fetchImpl: offline })
    const minted = await client.mintRound()
    const game = createBlackjackGame(account(), {
      stake: 1000,
      clientSeed: 'player',
      nonce: 1,
      serverSeed: minted.serverSeed,
    })
    expect(game.serverSeed).toBe(minted.serverSeed)
    expect(game.serverSeedHash).toBe(minted.serverSeedHash)
    expect(verifyShoe(game.serverSeed, game.clientSeed, game.nonce, game.shoe)).toBe(true)
  })
})
