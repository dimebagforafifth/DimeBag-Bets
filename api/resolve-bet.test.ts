import { describe, it, expect } from 'vitest'
import { handleResolveBet } from './resolve-bet.js'
import { createDerivedVault } from '../core/fairness-authority.js'
import { gradeBet } from '../games/grade.js'

describe('handleResolveBet', () => {
  it('400s without a commitId or a valid bet', async () => {
    const v = createDerivedVault('test-secret')
    expect((await handleResolveBet({}, v)).status).toBe(400)
    expect((await handleResolveBet({ commitId: 'x' }, v)).status).toBe(400)
  })

  it('reveals the seed and grades server-side, matching the published math', async () => {
    const vault = createDerivedVault('test-secret')
    const { commitId } = await vault.commit()
    const reveal = await vault.reveal(commitId)
    const bet = {
      game: 'dice' as const,
      target: 50,
      direction: 'over' as const,
      clientSeed: 'c',
      nonce: 3,
    }
    const res = await handleResolveBet({ commitId, bet }, vault)
    expect(res.status).toBe(200)

    // The handler's result must equal grading directly against the revealed seed — i.e. the
    // server, not the client, decided the outcome and the multiplier.
    const expected = gradeBet({ ...bet, serverSeed: reveal.serverSeed })
    const body = res.body as {
      outcome: string
      multiplier: number
      draw: number
      serverSeed: string
    }
    expect(body.outcome).toBe(expected.outcome)
    expect(body.multiplier).toBeCloseTo(expected.multiplier, 6)
    expect(body.draw).toBe(expected.draw)
    expect(body.serverSeed).toBe(reveal.serverSeed)
  })

  it('400s on a malformed bet rather than settling it', async () => {
    const vault = createDerivedVault('test-secret')
    const { commitId } = await vault.commit()
    const res = await handleResolveBet(
      { commitId, bet: { game: 'dice', target: 999, direction: 'over', clientSeed: 'c', nonce: 1 } },
      vault,
    )
    expect(res.status).toBe(400)
  })
})
