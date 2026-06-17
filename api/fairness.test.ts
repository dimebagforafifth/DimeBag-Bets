import { describe, expect, it } from 'vitest'
import { DEFAULT_CRASH_CONFIG, verifyCrashPoint } from '../games/crash/fair.js'
import { createDerivedVault, verifyServerSeed } from '../core/fairness-authority.js'
import { defaultVault, handleFairness } from './fairness.js'

describe('fairness endpoint handler', () => {
  it('commit returns a commitment with no seed', async () => {
    const { status, body } = await handleFairness({ action: 'commit' }, createDerivedVault('s'))
    expect(status).toBe(200)
    expect(body).toHaveProperty('commitId')
    expect(body).toHaveProperty('serverSeedHash')
    expect(body).not.toHaveProperty('serverSeed')
  })

  it('reveal matches the commitment hash (round-trips)', async () => {
    const vault = createDerivedVault('s')
    const commit = (await handleFairness({ action: 'commit' }, vault)).body as {
      commitId: string
      serverSeedHash: string
    }
    const reveal = (await handleFairness({ action: 'reveal', commitId: commit.commitId }, vault))
      .body as { serverSeed: string; serverSeedHash: string }
    expect(reveal.serverSeedHash).toBe(commit.serverSeedHash)
    expect(verifyServerSeed(reveal.serverSeed, commit.serverSeedHash)).toBe(true)
  })

  it('reveal without a commitId is a 400', async () => {
    const { status } = await handleFairness({ action: 'reveal' }, createDerivedVault('s'))
    expect(status).toBe(400)
  })

  it('resolveCrash returns a server-derived crash point that re-verifies with the public helper', async () => {
    const vault = createDerivedVault('s')
    const { commitId } = (await handleFairness({ action: 'commit' }, vault)).body as {
      commitId: string
    }
    const res = (
      await handleFairness(
        { action: 'resolveCrash', commitId, clientSeed: 'player-seed', nonce: 3 },
        vault,
      )
    ).body as { serverSeed: string; crashPoint: number }
    // The player independently re-derives the same crash point — authority, not trust.
    expect(
      verifyCrashPoint(res.serverSeed, 'player-seed', 3, res.crashPoint, DEFAULT_CRASH_CONFIG),
    ).toBe(true)
  })

  it('resolveCrash without clientSeed/nonce is a 400', async () => {
    const vault = createDerivedVault('s')
    const { commitId } = (await handleFairness({ action: 'commit' }, vault)).body as {
      commitId: string
    }
    const { status } = await handleFairness({ action: 'resolveCrash', commitId }, vault)
    expect(status).toBe(400)
  })

  it('an unknown action is a 400', async () => {
    // @ts-expect-error — exercising the runtime guard for a bad action
    const { status } = await handleFairness({ action: 'nope' }, createDerivedVault('s'))
    expect(status).toBe(400)
  })

  it('defaultVault works straight off the env (dev fallback, no config needed)', async () => {
    const vault = defaultVault({})
    const commit = (await handleFairness({ action: 'commit' }, vault)).body as { commitId: string }
    const reveal = (await handleFairness({ action: 'reveal', commitId: commit.commitId }, vault))
      .body as { serverSeed: string; serverSeedHash: string }
    expect(verifyServerSeed(reveal.serverSeed, reveal.serverSeedHash)).toBe(true)
  })
})
