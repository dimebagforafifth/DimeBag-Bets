/**
 * Client seam for the server-side provably-fair AUTHORITY (CLAUDE.md §6).
 *
 * This is what a game uses instead of minting its own server seed in the browser: it asks
 * the platform endpoint (`/api/fairness`) for a commitment before play and the reveal after,
 * so the server seed is the PLATFORM's, not the client's. The fairness math is unchanged —
 * the revealed seed re-runs each game's published `verify*` helper to the same outcome.
 *
 * Works with NO running endpoint: if the fetch can't reach the server (local dev, unit
 * tests, SSR), the client transparently falls back to an in-process authority using the
 * SAME isomorphic code, so behaviour is identical with or without a backend. The fallback is
 * only ever a dev convenience — in production the deployed serverless function answers, and
 * that is the trusted authority.
 */

import { hashServerSeed } from '../../core/fair.js'
import {
  createDerivedVault,
  verifyServerSeed,
  type Commitment,
  type Revelation,
  type SeedVault,
} from '../../core/fairness-authority.js'
import { crashPointFromSeeds, DEFAULT_CRASH_CONFIG, type CrashHouseConfig } from '../crash/fair.js'

export { hashServerSeed, verifyServerSeed }
export type { Commitment, Revelation }

/** The server-authoritative crash result: the reveal plus the server-derived crash point. */
export interface CrashResolution extends Revelation {
  clientSeed: string
  nonce: number
  crashPoint: number
}

export interface FairnessClient {
  /** Pre-play commitment — the hash, never the seed. */
  commit(): Promise<Commitment>
  /** Post-play disclosure of the seed, for verification. */
  reveal(commitId: string): Promise<Revelation>
  /** Ask the authority to reveal AND derive the crash point server-side. */
  resolveCrash(
    commitId: string,
    clientSeed: string,
    nonce: number,
    config?: CrashHouseConfig,
  ): Promise<CrashResolution>
}

export interface FairnessClientOptions {
  endpoint?: string
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * In-process fallback authority. Derived (stateless) so a commit and a later reveal stay
 * consistent without shared state — even across the simulated cold starts a serverless
 * function sees. The secret is a public dev constant: this path only runs when there is no
 * server (local/tests), where there is no adversary and money is local anyway.
 */
const LOCAL_FALLBACK_SECRET = 'dimebag-local-fairness-fallback'
const localVault: SeedVault = createDerivedVault(LOCAL_FALLBACK_SECRET)

export function createFairnessClient(options: FairnessClientOptions = {}): FairnessClient {
  const endpoint = options.endpoint ?? '/api/fairness'
  const fetchImpl = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined)
  // The FIRST call decides the mode and it sticks for this client's life: a commit and its
  // reveal must never split across remote/local (their seeds differ), so once we're 'remote'
  // a later failure throws rather than silently returning a wrong-seed local reveal.
  let mode: 'unknown' | 'remote' | 'local' = fetchImpl ? 'unknown' : 'local'

  async function remoteCall<T>(req: unknown): Promise<T> {
    const res = await fetchImpl!(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(`fairness endpoint ${res.status}`)
    return (await res.json()) as T
  }

  async function call<T>(req: unknown, local: () => Promise<T>): Promise<T> {
    if (mode === 'local') return local()
    if (mode === 'remote') return remoteCall<T>(req) // no unsafe fallback once committed remote
    try {
      const result = await remoteCall<T>(req)
      mode = 'remote'
      return result
    } catch {
      mode = 'local' // no server reachable on the first call — go local for good
      return local()
    }
  }

  return {
    commit() {
      return call<Commitment>({ action: 'commit' }, () => localVault.commit())
    },
    reveal(commitId) {
      return call<Revelation>({ action: 'reveal', commitId }, () => localVault.reveal(commitId))
    },
    resolveCrash(commitId, clientSeed, nonce, config = DEFAULT_CRASH_CONFIG) {
      return call<CrashResolution>(
        { action: 'resolveCrash', commitId, clientSeed, nonce, config },
        async () => {
          const revealed = await localVault.reveal(commitId)
          return {
            ...revealed,
            clientSeed,
            nonce,
            crashPoint: crashPointFromSeeds(revealed.serverSeed, clientSeed, nonce, config),
          }
        },
      )
    },
  }
}

/** A ready-to-use shared client (the default endpoint, global fetch). */
export const fairnessClient: FairnessClient = createFairnessClient()
