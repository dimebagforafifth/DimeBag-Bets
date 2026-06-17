import { describe, expect, it } from 'vitest'
import type { Account } from '../../core/index.js'
import { createFairnessClient } from '../shared/fair.js'
import { coinAt, createCoinFlip, flip, verifyCoinFlips } from './index.js'

const offline = (() => {
  throw new Error('offline')
}) as unknown as typeof fetch
const account = (): Account => ({ id: 'a', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('coinflip — server seed comes from the fairness authority', () => {
  it('starts the streak with an authority-minted seed; the streak verifies from the reveal', async () => {
    const client = createFairnessClient({ fetchImpl: offline })
    const minted = await client.mintRound()
    const a = account()
    const game = createCoinFlip(a, {
      stake: 1000,
      clientSeed: 'player',
      nonce: 1,
      serverSeed: minted.serverSeed,
    })
    // the seed used is exactly the authority's; its hash matches the pre-play commitment
    expect(game.serverSeed).toBe(minted.serverSeed)
    expect(game.serverSeedHash).toBe(minted.serverSeedHash)
    // play one flip so there's a real call/result to re-derive, then verify the round-trip
    const first = coinAt(game.serverSeed, game.clientSeed, game.nonce, 0)
    flip(a, game, first)
    expect(
      verifyCoinFlips(game.serverSeed, game.clientSeed, game.nonce, game.calls, game.results),
    ).toBe(true)
  })
})
