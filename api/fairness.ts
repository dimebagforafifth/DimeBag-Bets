/**
 * Vercel Serverless Function — the provably-fair AUTHORITY endpoint.
 *
 * Moves the server-seed commit-reveal off the client (CLAUDE.md §6). Flow:
 *   1. POST {action:'commit'}                       → { commitId, serverSeedHash }   (before play)
 *   2. client plays with its own clientSeed + nonce (money still moves only through core)
 *   3. POST {action:'reveal', commitId}             → { serverSeed, serverSeedHash } (after play)
 *      or {action:'resolveCrash', commitId,...}     → server reveals AND derives the outcome
 *
 * The fairness math is unchanged — `serverSeed` re-runs the published `verify*` helpers to
 * the same result. What this buys: the server seed is minted and hashed by the platform, so
 * the client/operator can no longer pick a favourable one.
 *
 * Works with NO backend: the default authority (`createDerivedVault`) is stateless — the
 * seed is a pure function of `FAIRNESS_SECRET` + commitId, so it survives serverless cold
 * starts with nothing stored. With `FAIRNESS_SECRET` unset it uses a dev fallback secret
 * (points-only, local) — production must set a real one.
 *
 * The handler CORE (`handleFairness`) is pure (request-in → result-out, no Node/res APIs) so
 * the exact same logic drops into a Supabase edge function later — only the thin adapter
 * below is Vercel-specific. No money is touched here (CLAUDE.md §3).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createDerivedVault,
  createStoredVault,
  resolveCommit,
  resolveMasterSecret,
  type SeedStore,
  type SeedVault,
} from '../core/fairness-authority.js'
import {
  crashPointFromSeeds,
  DEFAULT_CRASH_CONFIG,
  type CrashHouseConfig,
} from '../games/crash/fair.js'
// A↔B interlock (CLAUDE.md §6): the durable seed seam is fulfilled by A's Supabase-backed
// KVStore. Imported here at the composition root only; OFF until Supabase keys are present.
import {
  createStore,
  isSupabaseConfigured,
  type EnvSource,
  type KVStore,
  type SupabaseStore,
} from '../persistence/index.js'

export interface FairnessRequest {
  action: 'commit' | 'reveal' | 'resolveCrash'
  commitId?: string
  clientSeed?: string
  nonce?: number
  config?: CrashHouseConfig
}

export interface FairnessResult {
  status: number
  body: unknown
}

/** Build the default (stateless, derived) authority from an env bag. */
export function defaultVault(env: Record<string, string | undefined> = {}): SeedVault {
  return createDerivedVault(resolveMasterSecret(env).secret)
}

/**
 * A↔B INTERLOCK — adapt A's Supabase-backed `KVStore` to B's `SeedStore` (the durable seed
 * seam `core/fairness-authority.ts` declares: "fulfilled by a Supabase-backed table once
 * provisioned"). A drop-in: same interface, no game/money coupling — seeds are opaque blobs.
 *
 * A's store is a write-through cache (sync `get`/`set` over an in-memory snapshot; server I/O
 * in the background), so for durability ACROSS serverless invocations we await its lifecycle
 * hooks when present: `flush` after a write (push the seed to the server before `commit()`
 * returns) and `ready` before a read (pull the server snapshot into a fresh process's cache
 * before `reveal()`). With a plain non-Supabase store these are absent and it's a sync map.
 */
export function seedStoreFromKv(store: KVStore): SeedStore {
  const lifecycle = store as Partial<SupabaseStore>
  return {
    async put(commitId, serverSeed) {
      store.set(commitId, serverSeed)
      if (lifecycle.flush) await lifecycle.flush()
    },
    async get(commitId) {
      if (lifecycle.ready) await lifecycle.ready
      return store.get<string>(commitId) ?? undefined // KVStore returns null for absent → undefined
    },
  }
}

/** The Supabase-backed seed store, namespaced to its own keyspace (audit trail of issued seeds). */
export function createKvSeedStore(envSource?: EnvSource): SeedStore {
  return seedStoreFromKv(createStore({ namespace: 'fairness-seeds', envSource }))
}

/**
 * Build the authority from an env bag. With Supabase keys present → the DURABLE vault (a fresh
 * CSPRNG seed per commit, stored via A's backend — per-round randomness + an audit trail).
 * With NO keys → the stateless DERIVED vault (== `defaultVault`), so this is OFF by default and
 * byte-for-byte the no-backend behaviour. This is the seam production flips by dropping in keys.
 */
export function vaultFromEnv(env: EnvSource = {}): SeedVault {
  if (isSupabaseConfigured(env)) return createStoredVault(createKvSeedStore(env))
  return defaultVault(env)
}

/**
 * Pure request handler — Supabase-edge-portable. Inject the vault so tests can pass a
 * durable/fake one; production passes the env-derived default.
 */
export async function handleFairness(
  req: FairnessRequest,
  vault: SeedVault = defaultVault(),
): Promise<FairnessResult> {
  switch (req?.action) {
    case 'commit': {
      // Returns ONLY the hash — never the seed. This is the pre-play commitment.
      return { status: 200, body: await vault.commit() }
    }
    case 'reveal': {
      if (!req.commitId) return { status: 400, body: { error: 'commitId required' } }
      // Post-play disclosure for verification. (A standalone reveal is safe once the wager's
      // clientSeed + nonce are already fixed at placement; binding that on the server is the
      // server-authoritative-money seam — see docs/provably-fair-server.md.)
      return { status: 200, body: await vault.reveal(req.commitId) }
    }
    case 'resolveCrash': {
      if (!req.commitId) return { status: 400, body: { error: 'commitId required' } }
      if (typeof req.clientSeed !== 'string' || typeof req.nonce !== 'number') {
        return { status: 400, body: { error: 'clientSeed and nonce required' } }
      }
      const config = req.config ?? DEFAULT_CRASH_CONFIG
      // The SERVER reveals the seed and derives the crash point — the authoritative result.
      const resolved = await resolveCommit(vault, req.commitId, (serverSeed) =>
        crashPointFromSeeds(serverSeed, req.clientSeed as string, req.nonce as number, config),
      )
      return {
        status: 200,
        body: {
          commitId: resolved.commitId,
          serverSeed: resolved.serverSeed,
          serverSeedHash: resolved.serverSeedHash,
          clientSeed: req.clientSeed,
          nonce: req.nonce,
          crashPoint: resolved.outcome,
        },
      }
    }
    default:
      return { status: 400, body: { error: 'unknown action' } }
  }
}

// ── Vercel adapter (the only Node-specific part) ─────────────────────────────
function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'method not allowed' })
    return
  }
  try {
    const body = (await readJson(req)) as FairnessRequest
    // Durable Supabase-backed vault when keys are present, else the stateless derived default.
    const result = await handleFairness(body, vaultFromEnv(process.env))
    send(res, result.status, result.body)
  } catch {
    // Never leak internals (e.g. the secret); keep it generic.
    send(res, 500, { error: 'fairness request failed' })
  }
}
