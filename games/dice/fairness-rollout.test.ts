import { describe, expect, it } from 'vitest'
import type { Account } from '../../core/index.js'
import { createFairnessClient } from '../shared/fair.js'
import { playDice, verifyRoll } from './index.js'

// Force the in-process authority (no server in tests) — the SAME code the endpoint runs.
const offline = (() => {
  throw new Error('offline')
}) as unknown as typeof fetch
const account = (): Account => ({ id: 'a', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('dice — server seed comes from the fairness authority', () => {
  it('plays with an authority-minted seed; the round seed IS the committed one and verifies', async () => {
    const client = createFairnessClient({ fetchImpl: offline })
    const minted = await client.mintRound()
    const round = playDice(account(), {
      stake: 1000,
      target: 50,
      direction: 'over',
      clientSeed: 'player',
      nonce: 1,
      serverSeed: minted.serverSeed,
    })
    // the seed used is exactly the authority's; its hash matches the pre-play commitment
    expect(round.serverSeed).toBe(minted.serverSeed)
    expect(round.serverSeedHash).toBe(minted.serverSeedHash)
    // fairness math + verify tooling unchanged — the outcome re-derives from the revealed seed
    expect(verifyRoll(round.serverSeed, round.clientSeed, round.nonce, round.roll)).toBe(true)
  })
})
