import { describe, expect, it } from 'vitest'
import { handleFairness } from '../../api/fairness.js'
import { createDerivedVault } from '../../core/fairness-authority.js'
import { crashPointFromSeeds, DEFAULT_CRASH_CONFIG, verifyCrashPoint } from '../crash/fair.js'
import { createFairnessClient, verifyServerSeed } from './fair.js'

/** A fake fetch that drives the real endpoint handler over a fixed vault — true client↔server. */
function serverFetch(secret = 'server-secret'): typeof fetch {
  const vault = createDerivedVault(secret)
  return (async (_url: string, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body))
    const { status, body } = await handleFairness(req, vault)
    return { ok: status < 400, status, json: async () => body } as Response
  }) as unknown as typeof fetch
}

const offlineFetch = (() => {
  throw new Error('network down')
}) as unknown as typeof fetch

describe('fairness client — talking to the endpoint', () => {
  it('commits then reveals against the server, and the reveal verifies', async () => {
    const client = createFairnessClient({ fetchImpl: serverFetch() })
    const commitment = await client.commit()
    expect(commitment).not.toHaveProperty('serverSeed') // commit precedes the reveal
    const revelation = await client.reveal(commitment.commitId)
    expect(revelation.serverSeedHash).toBe(commitment.serverSeedHash)
    expect(verifyServerSeed(revelation.serverSeed, commitment.serverSeedHash)).toBe(true)
  })

  it('resolveCrash returns a server-authoritative crash point the player can re-verify', async () => {
    const client = createFairnessClient({ fetchImpl: serverFetch() })
    const { commitId } = await client.commit()
    const res = await client.resolveCrash(commitId, 'my-seed', 9)
    expect(
      verifyCrashPoint(res.serverSeed, 'my-seed', 9, res.crashPoint, DEFAULT_CRASH_CONFIG),
    ).toBe(true)
  })

  it('mintRound commits then reveals a seed in one call, hash matching (the all-games seam)', async () => {
    const client = createFairnessClient({ fetchImpl: serverFetch() })
    const minted = await client.mintRound()
    expect(minted.serverSeed).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyServerSeed(minted.serverSeed, minted.serverSeedHash)).toBe(true)
  })

  it('mintRound works with no server (in-process authority) and stays consistent', async () => {
    const client = createFairnessClient({ fetchImpl: offlineFetch })
    const minted = await client.mintRound()
    expect(verifyServerSeed(minted.serverSeed, minted.serverSeedHash)).toBe(true)
    // a re-reveal of the same commit returns the same seed (derived vault is stateless)
    const again = await client.reveal(minted.commitId)
    expect(again.serverSeed).toBe(minted.serverSeed)
  })
})

describe('fairness client — offline fallback (no server, e.g. local dev / tests)', () => {
  it('still commits, reveals, and verifies via the in-process authority', async () => {
    const client = createFairnessClient({ fetchImpl: offlineFetch })
    const { commitId, serverSeedHash } = await client.commit()
    const revelation = await client.reveal(commitId)
    expect(revelation.serverSeedHash).toBe(serverSeedHash)
    expect(verifyServerSeed(revelation.serverSeed, serverSeedHash)).toBe(true)
  })

  it('resolveCrash falls back consistently — crash point matches the revealed seed', async () => {
    const client = createFairnessClient({ fetchImpl: offlineFetch })
    const { commitId } = await client.commit()
    const res = await client.resolveCrash(commitId, 'seed', 2)
    expect(res.crashPoint).toBe(
      crashPointFromSeeds(res.serverSeed, 'seed', 2, DEFAULT_CRASH_CONFIG),
    )
  })

  it('is sticky: a commit and its reveal never split across server/local', async () => {
    // Server answers commit but then "goes down" for reveal — the client must NOT silently
    // switch to the local vault (whose seed for that commitId would differ).
    let calls = 0
    const flaky = (async (url: string, init?: RequestInit) => {
      calls++
      if (calls === 1) return serverFetch('s')(url, init) // commit succeeds
      throw new Error('server went away') // reveal would fall back → mismatch if not sticky
    }) as unknown as typeof fetch
    const client = createFairnessClient({ fetchImpl: flaky })
    const { commitId, serverSeedHash } = await client.commit()
    // Reveal hits the dead server; sticky stays remote and surfaces the failure rather than
    // returning a wrong-seed local reveal.
    await expect(client.reveal(commitId)).rejects.toThrow()
    expect(serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
