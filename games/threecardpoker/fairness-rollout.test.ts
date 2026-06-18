import { describe, expect, it } from 'vitest'
import type { Account } from '../../core/index.js'
import { createFairnessClient } from '../shared/fair.js'
import { createGame, verify } from './index.js'

// Force the in-process authority (no server in tests) — the SAME code the endpoint runs.
const offline = (() => {
  throw new Error('offline')
}) as unknown as typeof fetch
const account = (): Account => ({ id: 'a', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('three card poker — server seed comes from the fairness authority', () => {
  it('deals with an authority-minted seed; the round seed IS the committed one and verifies', async () => {
    const client = createFairnessClient({ fetchImpl: offline })
    const minted = await client.mintRound()
    const game = createGame(account(), {
      ante: 1000,
      clientSeed: 'player',
      nonce: 1,
      serverSeed: minted.serverSeed,
    })
    // the seed used is exactly the authority's; its hash matches the pre-play commitment
    expect(game.serverSeed).toBe(minted.serverSeed)
    expect(game.serverSeedHash).toBe(minted.serverSeedHash)
    // fairness math + verify tooling unchanged — both hands re-derive from the revealed seed
    expect(
      verify(game.serverSeed, game.clientSeed, game.nonce, {
        player: game.player,
        dealer: game.dealer,
      }),
    ).toBe(true)
  })
})
