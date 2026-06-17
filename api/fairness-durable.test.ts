import { describe, expect, it } from 'vitest'
import {
  createDerivedVault,
  createStoredVault,
  verifyServerSeed,
  type SeedStore,
} from '../core/fairness-authority.js'
import { vaultFromEnv } from './fairness.js'

/**
 * Verifies the DURABLE commit→reveal path B-round-1 built (`createStoredVault`) against the
 * contract of the new `supabase/migrations/0006_fairness_seeds.sql` table — the path round 2
 * wired but left unverified. No live Supabase needed: a fake stands in for the server-side
 * `fairness_seeds` table (commit_id PK → server_seed), the same way persistence/ fakes its
 * backend. Async get/put mirror the network I/O of the real PostgREST store.
 *
 * The point of a DURABLE vault (vs the stateless derived default): the seed is a fresh CSPRNG
 * value that only exists in storage — so it must survive a serverless COLD START (a fresh
 * process with an empty cache) by being read back from the shared table. That cross-instance
 * durability is exactly what this exercises.
 */
function fairnessSeedsTable() {
  const rows = new Map<string, string>() // the shared server-side table
  return {
    /** A SeedStore view — what one serverless invocation sees. All views share the table. */
    store(): SeedStore {
      return {
        async put(commitId, serverSeed) {
          rows.set(commitId, serverSeed)
        },
        async get(commitId) {
          return rows.get(commitId)
        },
      }
    },
    rowCount: () => rows.size,
  }
}

describe('durable fairness seeds — createStoredVault over the fairness_seeds table contract', () => {
  it('commit publishes only the hash; the seed is persisted and revealed', async () => {
    const table = fairnessSeedsTable()
    const vault = createStoredVault(table.store())
    const commit = await vault.commit()
    expect(commit).not.toHaveProperty('serverSeed') // the seed is withheld at commit
    expect(table.rowCount()).toBe(1) // ...but it WAS stored durably
    const reveal = await vault.reveal(commit.commitId)
    expect(reveal.serverSeedHash).toBe(commit.serverSeedHash)
    expect(verifyServerSeed(reveal.serverSeed, commit.serverSeedHash)).toBe(true)
  })

  it('survives a serverless COLD START — a fresh vault instance reveals the stored seed', async () => {
    const table = fairnessSeedsTable()
    // invocation #1 commits
    const commit = await createStoredVault(table.store()).commit()
    // invocation #2 = a brand-new process (fresh vault, empty in-memory state) over the SAME table
    const reveal = await createStoredVault(table.store()).reveal(commit.commitId)
    expect(reveal.serverSeedHash).toBe(commit.serverSeedHash)
    expect(verifyServerSeed(reveal.serverSeed, commit.serverSeedHash)).toBe(true)
  })

  it('the seed lives ONLY in the table — without it, reveal fails (no recompute, unlike derived)', async () => {
    const committed = await createStoredVault(fairnessSeedsTable().store()).commit()
    // A different (empty) table has never seen this commit → cannot disclose the seed.
    await expect(
      createStoredVault(fairnessSeedsTable().store()).reveal(committed.commitId),
    ).rejects.toThrow(/unknown commitId/)
    // Contrast: the stateless derived vault recomputes the seed from its secret with no storage.
    const derived = createDerivedVault('a-secret')
    const r = await derived.reveal('any-id-no-commit-needed')
    expect(verifyServerSeed(r.serverSeed, r.serverSeedHash)).toBe(true)
  })

  it('two commits get distinct durable rows (per-round randomness + audit trail)', async () => {
    const table = fairnessSeedsTable()
    const vault = createStoredVault(table.store())
    const a = await vault.commit()
    const b = await vault.commit()
    expect(a.commitId).not.toBe(b.commitId)
    expect(a.serverSeedHash).not.toBe(b.serverSeedHash)
    expect(table.rowCount()).toBe(2)
  })

  it('OFF by default: vaultFromEnv with no keys never touches the table (derived vault)', async () => {
    const vault = vaultFromEnv({})
    // The derived vault reveals any id with no prior commit — the tell it is the no-backend default.
    const reveal = await vault.reveal('needs-no-commit')
    expect(verifyServerSeed(reveal.serverSeed, reveal.serverSeedHash)).toBe(true)
  })
})
