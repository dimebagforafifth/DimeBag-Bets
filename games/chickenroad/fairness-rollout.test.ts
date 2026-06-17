import { describe, expect, it } from 'vitest'
import type { Account } from '../../core/index.js'
import { createFairnessClient } from '../shared/fair.js'
import { createChickenGame, SPECS, verifyCrashLane } from './index.js'

const offline = (() => {
  throw new Error('offline')
}) as unknown as typeof fetch
const account = (): Account => ({ id: 'a', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('chicken road — server seed comes from the fairness authority', () => {
  it('commits the crash lane with an authority-minted seed; the lane verifies from the reveal', async () => {
    const client = createFairnessClient({ fetchImpl: offline })
    const minted = await client.mintRound()
    const game = createChickenGame(account(), {
      stake: 1000,
      difficulty: 'medium',
      clientSeed: 'player',
      nonce: 1,
      serverSeed: minted.serverSeed,
    })
    expect(game.serverSeed).toBe(minted.serverSeed)
    expect(game.serverSeedHash).toBe(minted.serverSeedHash)
    expect(
      verifyCrashLane(
        game.serverSeed,
        game.clientSeed,
        game.nonce,
        SPECS[game.difficulty].survival,
        game.lanes,
        game.crashLane,
      ),
    ).toBe(true)
  })
})
