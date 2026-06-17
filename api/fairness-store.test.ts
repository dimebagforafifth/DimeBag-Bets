import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '../persistence/index.js'
import { createStoredVault, verifyServerSeed } from '../core/fairness-authority.js'
import { seedStoreFromKv, vaultFromEnv, handleFairness } from './fairness.js'

/**
 * A↔B interlock: B's durable seed seam (`createStoredVault`) fulfilled by A's persistence
 * `KVStore`. These prove the adapter round-trips AND that the wiring stays OFF by default
 * (no Supabase keys → the stateless derived vault, byte-for-byte the no-backend behaviour).
 */
describe('A↔B interlock — KVStore-backed durable seed vault', () => {
  it('seedStoreFromKv yields a durable vault that round-trips commit → reveal', async () => {
    const vault = createStoredVault(seedStoreFromKv(createMemoryStore()))
    const commit = await vault.commit()
    expect(commit).not.toHaveProperty('serverSeed') // commit publishes only the hash
    const reveal = await vault.reveal(commit.commitId)
    expect(reveal.serverSeedHash).toBe(commit.serverSeedHash)
    expect(verifyServerSeed(reveal.serverSeed, commit.serverSeedHash)).toBe(true)
  })

  it('the durable vault rejects an unknown commitId (the stored-seed contract)', async () => {
    const vault = createStoredVault(seedStoreFromKv(createMemoryStore()))
    await expect(vault.reveal('never-committed')).rejects.toThrow(/unknown commitId/)
  })

  it('the adapter maps an absent key to undefined (KVStore null → SeedStore undefined)', async () => {
    const seedStore = seedStoreFromKv(createMemoryStore())
    expect(await seedStore.get('missing')).toBeUndefined()
  })

  it('OFF by default: vaultFromEnv with no keys is the stateless DERIVED vault', async () => {
    const vault = vaultFromEnv({})
    // A derived vault recomputes the seed from its secret, so it can reveal ANY id with no
    // prior commit — the tell that this is the no-backend default, not the durable store.
    const reveal = await vault.reveal('id-needs-no-commit')
    expect(verifyServerSeed(reveal.serverSeed, reveal.serverSeedHash)).toBe(true)
    // ...and a normal commit → reveal still round-trips through the handler.
    const commit = (await handleFairness({ action: 'commit' }, vault)).body as { commitId: string }
    const back = (await handleFairness({ action: 'reveal', commitId: commit.commitId }, vault))
      .body as { serverSeed: string; serverSeedHash: string }
    expect(verifyServerSeed(back.serverSeed, back.serverSeedHash)).toBe(true)
  })
})
