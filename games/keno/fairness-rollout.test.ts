import { describe, expect, it } from 'vitest'
import type { Account } from '../../core/index.js'
import { createFairnessClient } from '../shared/fair.js'
import { playKeno, verifyDraw } from './index.js'

const offline = (() => {
  throw new Error('offline')
}) as unknown as typeof fetch
const account = (): Account => ({ id: 'a', creditLimit: 1_000_000, balance: 0, pending: 0 })

describe('keno — server seed comes from the fairness authority', () => {
  it('draws with an authority-minted seed; the round seed IS the committed one and verifies', async () => {
    const client = createFairnessClient({ fetchImpl: offline })
    const minted = await client.mintRound()
    const round = playKeno(account(), {
      stake: 1000,
      picks: [1, 2, 3, 4, 5],
      risk: 'classic',
      clientSeed: 'player',
      nonce: 1,
      serverSeed: minted.serverSeed,
    })
    // the seed used is exactly the authority's; its hash matches the pre-play commitment
    expect(round.serverSeed).toBe(minted.serverSeed)
    expect(round.serverSeedHash).toBe(minted.serverSeedHash)
    // fairness math + verify tooling unchanged — the draw re-derives from the revealed seed
    expect(verifyDraw(round.serverSeed, round.clientSeed, round.nonce, round.drawn)).toBe(true)
  })
})
