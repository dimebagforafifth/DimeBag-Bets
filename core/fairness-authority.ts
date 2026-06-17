/**
 * Server-side provably-fair AUTHORITY (CLAUDE.md §6).
 *
 * Today every game mints its own server seed in the browser (`randomServerSeed()`),
 * commits the hash, and reveals — all in one client process. That means the client (or a
 * malicious operator running the same client) could pick a favourable server seed before
 * play. This module moves the seed's birth, custody, and reveal behind ONE authority so the
 * PLATFORM — not the operator, not the player — is the trusted party.
 *
 * What does NOT change: the fairness MATH. Outcomes are still derived from
 * `core/fair.ts` (HMAC-SHA256 / client-seed / nonce) and stay independently verifiable —
 * a player re-runs the published `verify*` helper on the revealed seed exactly as before.
 * What changes is WHERE the server seed comes from and when it is revealed.
 *
 * Isomorphic by construction (only `@noble/hashes`, no Node/DOM APIs): the SAME code runs
 * in a Vercel serverless function today and a Supabase edge function later (see
 * `api/fairness.ts`) — no rewrite when the backend is provisioned.
 */

import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils'
import { hashServerSeed } from './fair.js'

/** Published BEFORE play: the hash pins the seed without revealing it. */
export interface Commitment {
  /** Opaque handle for this round's seed; the client never derives the seed from it. */
  commitId: string
  /** SHA-256(serverSeed) — the commit. Shown up front so the seed can't be swapped later. */
  serverSeedHash: string
}

/** Disclosed AFTER play so the player can verify; the hash must match the commitment. */
export interface Revelation extends Commitment {
  serverSeed: string
}

/**
 * Holds server seeds behind a commit. Async so a durable/Supabase-backed implementation
 * (real I/O) and the stateless derived one share a signature; the derived default just
 * resolves immediately.
 */
export interface SeedVault {
  commit(): Promise<Commitment>
  reveal(commitId: string): Promise<Revelation>
}

/**
 * STATELESS authority — the default, and the reason this works with no database.
 *
 * The server seed is a pure function of a server-only master secret and a random commit id:
 *   serverSeed = HMAC-SHA256(masterSecret, `server-seed:${commitId}`)
 *
 * So nothing has to be stored between the commit call and the reveal call — the reveal
 * recomputes the same seed. That survives serverless cold starts (each invocation is a
 * fresh process) without any infra. Integrity holds because:
 *  - the client never sees `masterSecret`, so it can't predict the seed;
 *  - the commit returns the hash immediately for a server-chosen `commitId`, and the seed
 *    is fixed by that id, so the operator can't swap it after seeing the bet;
 *  - the outcome also depends on the player's `clientSeed` + `nonce` (supplied only at play
 *    time), so the server can't grind commit ids for a favourable result at commit time.
 */
export function createDerivedVault(masterSecret: string): SeedVault {
  if (!masterSecret) throw new Error('fairness master secret is required')
  const secret = utf8ToBytes(masterSecret)
  const seedFor = (commitId: string): string =>
    bytesToHex(hmac(sha256, secret, utf8ToBytes(`server-seed:${commitId}`)))

  return {
    async commit() {
      const commitId = bytesToHex(randomBytes(16))
      return { commitId, serverSeedHash: hashServerSeed(seedFor(commitId)) }
    },
    async reveal(commitId) {
      if (!commitId) throw new Error('commitId is required to reveal')
      const serverSeed = seedFor(commitId)
      return { commitId, serverSeed, serverSeedHash: hashServerSeed(serverSeed) }
    },
  }
}

/** Durable seed storage seam — fulfilled by a Supabase-backed table once provisioned. */
export interface SeedStore {
  put(commitId: string, serverSeed: string): void | Promise<void>
  get(commitId: string): string | undefined | Promise<string | undefined>
}

/**
 * DURABLE authority — generates a fresh CSPRNG seed per commit and stores it. Use when you
 * want per-round randomness independent of any master secret plus an audit trail of issued
 * seeds (the natural fit for a Supabase table). Off by default; the derived vault is what
 * runs with no keys, preserving the byte-for-byte-identical-without-keys invariant.
 */
export function createStoredVault(store: SeedStore): SeedVault {
  return {
    async commit() {
      const commitId = bytesToHex(randomBytes(16))
      const serverSeed = bytesToHex(randomBytes(32))
      await store.put(commitId, serverSeed)
      return { commitId, serverSeedHash: hashServerSeed(serverSeed) }
    },
    async reveal(commitId) {
      if (!commitId) throw new Error('commitId is required to reveal')
      const serverSeed = await store.get(commitId)
      if (!serverSeed) throw new Error('unknown commitId')
      return { commitId, serverSeed, serverSeedHash: hashServerSeed(serverSeed) }
    },
  }
}

/** Re-derive the commit from a revealed seed — the player's check that nothing was swapped. */
export function verifyServerSeed(serverSeed: string, serverSeedHash: string): boolean {
  return hashServerSeed(serverSeed) === serverSeedHash
}

/**
 * Reveal a round's seed and compute its outcome IN THE SAME AUTHORITY, so the server is the
 * one that derives the result from the secret seed. `derive` is the game's existing pure
 * math (e.g. `crashPointFromSeeds`), kept generic so `core/` never depends on a game.
 */
export async function resolveCommit<T>(
  vault: SeedVault,
  commitId: string,
  derive: (serverSeed: string) => T,
): Promise<Revelation & { outcome: T }> {
  const revelation = await vault.reveal(commitId)
  return { ...revelation, outcome: derive(revelation.serverSeed) }
}

/**
 * A fixed dev secret so the authority WORKS NOW with nothing configured (points-only, local).
 * Production MUST set `FAIRNESS_SECRET` — `resolveMasterSecret` reports which one is in use so
 * a deploy can refuse to ship on the fallback.
 */
export const DEV_FAIRNESS_SECRET = 'dimebag-dev-fairness-secret-not-for-production'

export interface MasterSecret {
  secret: string
  /** true when the hardcoded dev fallback is in use (no `FAIRNESS_SECRET` set). */
  isDevFallback: boolean
}

/** Read `FAIRNESS_SECRET` from an env bag, falling back to the dev secret when absent. */
export function resolveMasterSecret(env: Record<string, string | undefined> = {}): MasterSecret {
  const secret = env.FAIRNESS_SECRET?.trim()
  return secret
    ? { secret, isDevFallback: false }
    : { secret: DEV_FAIRNESS_SECRET, isDevFallback: true }
}
