import { describe, it, expect } from 'vitest'
import { handleResolveBet, type ResolveBetRequest } from './resolve-bet.js'
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

  it('400s with structured issues on a malformed envelope (nonce not a number)', async () => {
    const vault = createDerivedVault('test-secret')
    const { commitId } = await vault.commit()
    // nonce arrives as a string — a shape the seed-reveal / grade path must never run on.
    const res = await handleResolveBet(
      { commitId, bet: { game: 'dice', clientSeed: 'c', nonce: '3' } } as unknown as ResolveBetRequest,
      vault,
    )
    expect(res.status).toBe(400)
    const body = res.body as { error: string; issues: Array<{ path: string; message: string }> }
    expect(body.error).toMatch(/invalid resolve request/)
    expect(body.issues.some((i) => i.path.includes('nonce'))).toBe(true)
  })

  it('rejects a bet with no game id before any seed is revealed', async () => {
    const vault = createDerivedVault('test-secret')
    const { commitId } = await vault.commit()
    const res = await handleResolveBet(
      { commitId, bet: { clientSeed: 'c', nonce: 1 } } as unknown as ResolveBetRequest,
      vault,
    )
    expect(res.status).toBe(400)
  })

  it('passes per-game fields through the envelope to the grader (win path)', async () => {
    const vault = createDerivedVault('test-secret')
    const { commitId } = await vault.commit()
    // `direction`/`target` aren't part of the validated envelope — they must survive passthrough
    // and reach gradeBet, which settles a well-formed dice bet to a 200.
    const res = await handleResolveBet(
      { commitId, bet: { game: 'dice', target: 50, direction: 'over', clientSeed: 'c', nonce: 7 } },
      vault,
    )
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('multiplier')
  })
})
