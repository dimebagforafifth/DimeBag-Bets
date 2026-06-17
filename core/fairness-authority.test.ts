import { describe, expect, it } from 'vitest'
import { firstUint32, hashServerSeed } from './fair.js'
import {
  createDerivedVault,
  createStoredVault,
  DEV_FAIRNESS_SECRET,
  resolveCommit,
  resolveMasterSecret,
  verifyServerSeed,
  type SeedStore,
} from './fairness-authority.js'

const SECRET = 'test-master-secret'

describe('derived vault (stateless, the no-DB default)', () => {
  it('commit publishes the hash and NOT the seed (commit precedes the reveal)', async () => {
    const vault = createDerivedVault(SECRET)
    const commitment = await vault.commit()
    expect(commitment.commitId).toMatch(/^[0-9a-f]{32}$/)
    expect(commitment.serverSeedHash).toMatch(/^[0-9a-f]{64}$/)
    // The commitment object exposes no seed — the only way to it is reveal().
    expect(Object.keys(commitment)).toEqual(['commitId', 'serverSeedHash'])
  })

  it('reveal returns a seed whose hash matches the up-front commitment', async () => {
    const vault = createDerivedVault(SECRET)
    const { commitId, serverSeedHash } = await vault.commit()
    const revelation = await vault.reveal(commitId)
    expect(revelation.serverSeedHash).toBe(serverSeedHash)
    expect(hashServerSeed(revelation.serverSeed)).toBe(serverSeedHash)
    expect(verifyServerSeed(revelation.serverSeed, serverSeedHash)).toBe(true)
  })

  it('is reproducible across a fresh vault — survives serverless cold starts with no storage', async () => {
    const committed = await createDerivedVault(SECRET).commit()
    // A brand-new vault instance (a different serverless invocation) reveals the same seed.
    const revealedByAnotherInstance = await createDerivedVault(SECRET).reveal(committed.commitId)
    expect(revealedByAnotherInstance.serverSeedHash).toBe(committed.serverSeedHash)
  })

  it('tampering is detectable: a swapped seed fails verification', async () => {
    const vault = createDerivedVault(SECRET)
    const { commitId, serverSeedHash } = await vault.commit()
    const real = await vault.reveal(commitId)
    const forged = `${real.serverSeed.slice(0, -1)}${real.serverSeed.endsWith('0') ? '1' : '0'}`
    expect(forged).not.toBe(real.serverSeed)
    expect(verifyServerSeed(forged, serverSeedHash)).toBe(false)
  })

  it('the client cannot predict the seed without the secret', async () => {
    const { commitId } = await createDerivedVault(SECRET).commit()
    // Same commitId, a different secret → a different seed: knowing commitId alone is useless.
    const a = await createDerivedVault(SECRET).reveal(commitId)
    const b = await createDerivedVault('a-different-secret').reveal(commitId)
    expect(a.serverSeed).not.toBe(b.serverSeed)
  })

  it('issues a unique commitId per round', async () => {
    const vault = createDerivedVault(SECRET)
    const ids = new Set<string>()
    for (let i = 0; i < 200; i++) ids.add((await vault.commit()).commitId)
    expect(ids.size).toBe(200)
  })

  it('requires a non-empty secret', () => {
    expect(() => createDerivedVault('')).toThrow(/secret/)
  })
})

describe('stored vault (durable seam for Supabase later)', () => {
  function memoryStore(): SeedStore {
    const map = new Map<string, string>()
    return { put: (id, s) => void map.set(id, s), get: (id) => map.get(id) }
  }

  it('commits a fresh random seed, reveals it, and the hash matches', async () => {
    const vault = createStoredVault(memoryStore())
    const { commitId, serverSeedHash } = await vault.commit()
    const revealed = await vault.reveal(commitId)
    expect(verifyServerSeed(revealed.serverSeed, serverSeedHash)).toBe(true)
  })

  it('reveal of an unknown commitId throws (nothing to disclose)', async () => {
    const vault = createStoredVault(memoryStore())
    await expect(vault.reveal('does-not-exist')).rejects.toThrow(/unknown commitId/)
  })
})

describe('resolveCommit — the server derives the outcome from the secret seed', () => {
  it('reveals and applies the game math in one authoritative step', async () => {
    const vault = createDerivedVault(SECRET)
    const { commitId } = await vault.commit()
    const resolved = await resolveCommit(vault, commitId, (seed) => firstUint32(seed, 'client', 7))
    // The outcome equals re-deriving from the revealed seed — independently checkable.
    expect(resolved.outcome).toBe(firstUint32(resolved.serverSeed, 'client', 7))
  })
})

describe('resolveMasterSecret', () => {
  it('uses FAIRNESS_SECRET when present', () => {
    expect(resolveMasterSecret({ FAIRNESS_SECRET: 'real' })).toEqual({
      secret: 'real',
      isDevFallback: false,
    })
  })

  it('falls back to the dev secret (flagged) when unset, so it works with no config', () => {
    const resolved = resolveMasterSecret({})
    expect(resolved.secret).toBe(DEV_FAIRNESS_SECRET)
    expect(resolved.isDevFallback).toBe(true)
  })
})
