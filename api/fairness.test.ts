import { describe, expect, it } from 'vitest'
import { DEFAULT_CRASH_CONFIG, verifyCrashPoint } from '../games/crash/fair.js'
import { createDerivedVault, verifyServerSeed } from '../core/fairness-authority.js'
import {
  createInMemoryRateLimiter,
  defaultVault,
  fairnessCommitRateLimitConfigFromEnv,
  handleFairness,
} from './fairness.js'

describe('fairness endpoint handler', () => {
  it('commit returns a commitment with no seed', async () => {
    const { status, body } = await handleFairness({ action: 'commit' }, createDerivedVault('s'))
    expect(status).toBe(200)
    expect(body).toHaveProperty('commitId')
    expect(body).toHaveProperty('serverSeedHash')
    expect(body).not.toHaveProperty('serverSeed')
  })

  it('rate-limits commit without changing the successful response shape', async () => {
    const limiter = createInMemoryRateLimiter({ max: 2, windowMs: 60_000 }, () => 1_000)
    const vault = createDerivedVault('s')

    const first = await handleFairness({ action: 'commit' }, vault, {
      commitRateLimiter: limiter,
      rateLimitKey: '203.0.113.10',
    })
    const second = await handleFairness({ action: 'commit' }, vault, {
      commitRateLimiter: limiter,
      rateLimitKey: '203.0.113.10',
    })
    const third = await handleFairness({ action: 'commit' }, vault, {
      commitRateLimiter: limiter,
      rateLimitKey: '203.0.113.10',
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(first.body).toHaveProperty('commitId')
    expect(first.body).toHaveProperty('serverSeedHash')
    expect(first.body).not.toHaveProperty('serverSeed')
    expect(third).toEqual({
      status: 429,
      body: { error: 'rate limit exceeded', retryAfterSeconds: 60 },
    })
  })

  it('scopes commit buckets by key and resets after the configured window', async () => {
    let now = 1_000
    const limiter = createInMemoryRateLimiter({ max: 1, windowMs: 500 }, () => now)
    const vault = createDerivedVault('s')

    expect(
      (await handleFairness({ action: 'commit' }, vault, {
        commitRateLimiter: limiter,
        rateLimitKey: 'ip:a',
      })).status,
    ).toBe(200)
    expect(
      (await handleFairness({ action: 'commit' }, vault, {
        commitRateLimiter: limiter,
        rateLimitKey: 'ip:a',
      })).status,
    ).toBe(429)
    expect(
      (await handleFairness({ action: 'commit' }, vault, {
        commitRateLimiter: limiter,
        rateLimitKey: 'ip:b',
      })).status,
    ).toBe(200)

    now = 1_500
    expect(
      (await handleFairness({ action: 'commit' }, vault, {
        commitRateLimiter: limiter,
        rateLimitKey: 'ip:a',
      })).status,
    ).toBe(200)
  })

  it('does not rate-limit reveal or resolveCrash', async () => {
    const limiter = createInMemoryRateLimiter({ max: 1, windowMs: 60_000 }, () => 1_000)
    const vault = createDerivedVault('s')
    const commit = (await handleFairness({ action: 'commit' }, vault, {
      commitRateLimiter: limiter,
      rateLimitKey: 'same-ip',
    })).body as { commitId: string }

    expect(
      (await handleFairness({ action: 'reveal', commitId: commit.commitId }, vault, {
        commitRateLimiter: limiter,
        rateLimitKey: 'same-ip',
      })).status,
    ).toBe(200)
    expect(
      (
        await handleFairness(
          { action: 'resolveCrash', commitId: commit.commitId, clientSeed: 'player', nonce: 1 },
          vault,
          { commitRateLimiter: limiter, rateLimitKey: 'same-ip' },
        )
      ).status,
    ).toBe(200)
  })

  it('reads commit rate-limit config from env with safe defaults', () => {
    expect(fairnessCommitRateLimitConfigFromEnv({})).toEqual({ max: 20, windowMs: 60_000 })
    expect(
      fairnessCommitRateLimitConfigFromEnv({
        FAIRNESS_COMMIT_RATE_LIMIT_MAX: '7',
        FAIRNESS_COMMIT_RATE_LIMIT_WINDOW_MS: '30000',
      }),
    ).toEqual({ max: 7, windowMs: 30_000 })
    expect(
      fairnessCommitRateLimitConfigFromEnv({
        FAIRNESS_COMMIT_RATE_LIMIT_MAX: '0',
        FAIRNESS_COMMIT_RATE_LIMIT_WINDOW_MS: 'nope',
      }),
    ).toEqual({ max: 20, windowMs: 60_000 })
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
