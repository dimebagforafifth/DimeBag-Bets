import { describe, expect, it } from 'vitest'
import { createMemoryStore, type FetchLike } from '../persistence/index.js'
import { createStoredVault, verifyServerSeed } from '../core/fairness-authority.js'
import {
  seedStoreFromKv,
  createFairnessSeedStore,
  vaultFromEnv,
  handleFairness,
} from './fairness.js'

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

  it('OFF by default: anon key WITHOUT the service-role key still falls back to derived', async () => {
    // The durable table is service-role-only, so anon-only config must NOT switch it on.
    const vault = vaultFromEnv({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon' })
    const reveal = await vault.reveal('id-needs-no-commit') // derived can reveal with no commit
    expect(verifyServerSeed(reveal.serverSeed, reveal.serverSeedHash)).toBe(true)
  })
})

/**
 * Round-3 security repoint: the runtime durable store targets the dedicated, service-role-only
 * `fairness_seeds` table (migration 0006), NOT the read-own `kv_documents` table. A fake
 * PostgREST server proves the round-trip, the table, and the service-role auth — no network.
 */
describe('durable seed store → fairness_seeds (service-role, not kv_documents)', () => {
  function fakeSupabase() {
    const table = new Map<string, string>() // commit_id → server_seed
    const calls: { method: string; url: string; apikey?: string; auth?: string }[] = []
    const fetchImpl: FetchLike = async (url, init) => {
      const method = init?.method ?? 'GET'
      const h = (init?.headers ?? {}) as Record<string, string>
      calls.push({ method, url, apikey: h.apikey, auth: h.Authorization })
      if (method === 'POST') {
        const row = JSON.parse(init?.body as string) as { commit_id: string; server_seed: string }
        table.set(row.commit_id, row.server_seed)
        return { ok: true, status: 201, json: async () => [], text: async () => '' }
      }
      const id = decodeURIComponent(url.match(/commit_id=eq\.([^&]+)/)?.[1] ?? '')
      const seed = table.get(id)
      return {
        ok: true,
        status: 200,
        json: async () => (seed ? [{ server_seed: seed }] : []),
        text: async () => '',
      }
    }
    return { fetchImpl, calls }
  }

  const env = { url: 'https://proj.supabase.co', anonKey: 'ANON-must-not-be-used' }

  it('round-trips commit → reveal against fairness_seeds, authed with the SERVICE-ROLE key', async () => {
    const { fetchImpl, calls } = fakeSupabase()
    const vault = createStoredVault(createFairnessSeedStore(env, 'SERVICE-ROLE-KEY', fetchImpl))
    const commit = await vault.commit()
    const reveal = await vault.reveal(commit.commitId)
    expect(verifyServerSeed(reveal.serverSeed, commit.serverSeedHash)).toBe(true)
    // every call hit /fairness_seeds (never kv_documents) and authed with the service-role key
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(calls.every((c) => c.url.includes('/fairness_seeds'))).toBe(true)
    expect(calls.some((c) => c.url.includes('kv_documents'))).toBe(false)
    expect(
      calls.every((c) => c.apikey === 'SERVICE-ROLE-KEY' && c.auth === 'Bearer SERVICE-ROLE-KEY'),
    ).toBe(true)
    expect(calls.some((c) => (c.apikey ?? '').includes('ANON'))).toBe(false)
  })

  it('rejects an unknown commitId (no row in fairness_seeds)', async () => {
    const { fetchImpl } = fakeSupabase()
    const vault = createStoredVault(createFairnessSeedStore(env, 'SERVICE-ROLE-KEY', fetchImpl))
    await expect(vault.reveal('never-stored')).rejects.toThrow(/unknown commitId/)
  })
})

/**
 * Round-4 hardening: the durable store stamps `revealed_at` (migration 0006) the FIRST time a
 * seed is disclosed, for a disclosure audit trail. A richer fake tracks the column + PATCHes.
 */
describe('disclosure audit — revealed_at stamped on first reveal (migration 0006)', () => {
  function fakeSupabaseWithAudit() {
    const rows = new Map<string, { server_seed: string; revealed_at: string | null }>()
    const patches: { url: string; revealed_at?: string }[] = []
    const fetchImpl: FetchLike = async (url, init) => {
      const method = init?.method ?? 'GET'
      if (method === 'POST') {
        const row = JSON.parse(init?.body as string) as { commit_id: string; server_seed: string }
        rows.set(row.commit_id, { server_seed: row.server_seed, revealed_at: null })
        return { ok: true, status: 201, json: async () => [], text: async () => '' }
      }
      const id = decodeURIComponent(url.match(/commit_id=eq\.([^&]+)/)?.[1] ?? '')
      if (method === 'PATCH') {
        const body = JSON.parse(init?.body as string) as { revealed_at?: string }
        patches.push({ url, revealed_at: body.revealed_at })
        const row = rows.get(id)
        // Honour the `revealed_at=is.null` filter → only the FIRST disclosure stamps.
        if (row && url.includes('revealed_at=is.null') && row.revealed_at === null) {
          row.revealed_at = body.revealed_at ?? null
        }
        return { ok: true, status: 204, json: async () => [], text: async () => '' }
      }
      const row = rows.get(id)
      return {
        ok: true,
        status: 200,
        json: async () => (row ? [{ server_seed: row.server_seed }] : []),
        text: async () => '',
      }
    }
    return { fetchImpl, rows, patches }
  }

  const env = { url: 'https://proj.supabase.co', anonKey: 'ANON' }

  it('stamps revealed_at with the disclosure clock on first reveal, and not before', async () => {
    const { fetchImpl, rows, patches } = fakeSupabaseWithAudit()
    let n = 0
    const now = () => `2026-06-17T00:0${(n += 1)}:00.000Z` // 1st call → :01, 2nd → :02, …
    const vault = createStoredVault(
      createFairnessSeedStore(env, 'SERVICE-ROLE-KEY', fetchImpl, now),
    )

    const commit = await vault.commit()
    expect(rows.get(commit.commitId)?.revealed_at).toBeNull() // committed, not yet disclosed
    expect(patches).toHaveLength(0)

    await vault.reveal(commit.commitId)
    expect(rows.get(commit.commitId)?.revealed_at).toBe('2026-06-17T00:01:00.000Z') // stamped
    expect(patches).toHaveLength(1)
    expect(patches[0].url).toContain('/fairness_seeds')
    expect(patches[0].url).toContain('revealed_at=is.null') // only stamps an unrevealed row
  })

  it('a re-reveal still discloses but does NOT overwrite the first disclosure time', async () => {
    const { fetchImpl, rows, patches } = fakeSupabaseWithAudit()
    let n = 0
    const now = () => `2026-06-17T00:0${(n += 1)}:00.000Z`
    const vault = createStoredVault(
      createFairnessSeedStore(env, 'SERVICE-ROLE-KEY', fetchImpl, now),
    )
    const commit = await vault.commit()
    await vault.reveal(commit.commitId)
    const first = rows.get(commit.commitId)?.revealed_at
    await vault.reveal(commit.commitId) // clock advances, but the is.null filter blocks a re-stamp
    expect(rows.get(commit.commitId)?.revealed_at).toBe(first)
    // The first-disclosure-wins guarantee is the IMPLEMENTATION's: it sends the
    // `revealed_at=is.null` idempotency filter on EVERY stamp (the DB then refuses the second
    // write). Assert the store actually emitted it both times, so this test fails if the
    // implementation ever drops the filter — not just because the fake happens to honour it.
    expect(patches).toHaveLength(2)
    expect(patches.every((p) => p.url.includes('revealed_at=is.null'))).toBe(true)
  })

  it('does not stamp (no audit row touched) for an unknown commitId', async () => {
    const { fetchImpl, patches } = fakeSupabaseWithAudit()
    const vault = createStoredVault(createFairnessSeedStore(env, 'SERVICE-ROLE-KEY', fetchImpl))
    await expect(vault.reveal('never-stored')).rejects.toThrow(/unknown commitId/)
    expect(patches).toHaveLength(0) // get found no seed → no disclosure stamp
  })

  it('a stamp failure never breaks the reveal (best-effort audit)', async () => {
    const seeds = new Map<string, string>()
    const fetchImpl: FetchLike = async (url, init) => {
      const method = init?.method ?? 'GET'
      if (method === 'POST') {
        const row = JSON.parse(init?.body as string) as { commit_id: string; server_seed: string }
        seeds.set(row.commit_id, row.server_seed)
        return { ok: true, status: 201, json: async () => [], text: async () => '' }
      }
      if (method === 'PATCH') throw new Error('stamp network down')
      const id = decodeURIComponent(url.match(/commit_id=eq\.([^&]+)/)?.[1] ?? '')
      const seed = seeds.get(id)
      return {
        ok: true,
        status: 200,
        json: async () => (seed ? [{ server_seed: seed }] : []),
        text: async () => '',
      }
    }
    const vault = createStoredVault(createFairnessSeedStore(env, 'SERVICE-ROLE-KEY', fetchImpl))
    const commit = await vault.commit()
    const reveal = await vault.reveal(commit.commitId) // must NOT throw despite the PATCH failure
    expect(verifyServerSeed(reveal.serverSeed, commit.serverSeedHash)).toBe(true)
  })
})
