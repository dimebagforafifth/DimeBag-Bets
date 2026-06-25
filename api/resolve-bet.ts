/**
 * Vercel Serverless Function — server-authoritative bet RESOLUTION (CLAUDE.md §3, §6).
 *
 * The money-path counterpart to api/fairness.ts. The browser places a wager (holding the
 * stake through core) with a clientSeed + nonce fixed at placement, against a server
 * commitment. To SETTLE it, the client posts the commitId + its bet parameters here; the
 * SERVER reveals the seed and derives the outcome AND payout multiplier with the game's
 * own published math (games/grade.ts) — so the result is the platform's, never a number
 * the client supplied. This closes the "client tells the server it won" hole.
 *
 * Flow:
 *   1. (api/fairness.ts) POST {action:'commit'}         → { commitId, serverSeedHash }
 *   2. client places the wager (core hold) with clientSeed + nonce
 *   3. POST here {commitId, bet:{game,...}}             → { outcome, multiplier, draw, serverSeed… }
 *   4. the SERVER settles via the service-role `service_resolve_wager` RPC (migration 0007)
 *      using THIS multiplier — the client never passes one.
 *
 * The handler CORE (`handleResolveBet`) is pure (reveal + grade, no money, no Node APIs),
 * exactly like `handleFairness`, so it drops into a Supabase edge function unchanged. The
 * money settlement (step 4) is composed in the deployment that has the service-role key.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { resolveCommit, type SeedVault } from '../core/fairness-authority.js'
import { gradeBet, type GradeRequest, type GradeResult } from '../games/grade.js'
import { ambientEnv, validateServerEnv } from '../lib/env.js'
import { defaultVault, vaultFromEnv } from './fairness.js'

/** Omit a key from EACH member of a discriminated union (plain `Omit` collapses it). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

export interface ResolveBetRequest {
  /** The fairness commitment from the `commit` call — the server reveals its seed. */
  commitId?: string
  /** The bet to grade, minus the serverSeed (the server supplies that on reveal). */
  bet?: DistributiveOmit<GradeRequest, 'serverSeed'>
}

export interface ResolveBetResult {
  status: number
  body: unknown
}

/**
 * Request-envelope schema (the trust boundary). It validates the SHAPE the handler depends on —
 * a commitId and a bet carrying at least a game id + the fixed clientSeed/nonce — and PASSES
 * THROUGH the per-game fields (target, mineCount, rows, …) unvalidated here. Those are graded by
 * `gradeBet`, which rejects an out-of-range/unknown bet (its own boundary). So nothing reaches
 * the seed-reveal or grading path without a well-formed envelope, and the deep per-game checks
 * stay where the game math lives.
 */
const resolveBetRequestSchema = z.object({
  commitId: z.string().min(1),
  bet: z
    .object({
      game: z.string().min(1),
      clientSeed: z.string(),
      nonce: z.number(),
    })
    .passthrough(),
})

/** Flatten a zod error into a structured, JSON-safe issue list for a 400 body. */
function issuesOf(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }))
}

/**
 * Pure handler — Supabase-edge-portable. Reveals the round's seed through the authority,
 * then grades the bet with the server seed. Returns the authoritative outcome + multiplier
 * + the disclosed seed (so the player can verify). Injects the vault for testing.
 */
export async function handleResolveBet(
  req: ResolveBetRequest,
  vault: SeedVault = defaultVault(),
): Promise<ResolveBetResult> {
  const parsed = resolveBetRequestSchema.safeParse(req)
  if (!parsed.success) {
    return { status: 400, body: { error: 'invalid resolve request', issues: issuesOf(parsed.error) } }
  }
  const { commitId, bet } = parsed.data
  try {
    // The SERVER reveals the seed and derives the outcome — the authoritative settlement.
    const resolved = await resolveCommit(vault, commitId, (serverSeed) =>
      // Reconstitute the discriminated union member with the revealed seed grafted on.
      gradeBet({ ...bet, serverSeed } as GradeRequest),
    )
    const grade: GradeResult = resolved.outcome
    return {
      status: 200,
      body: {
        commitId: resolved.commitId,
        serverSeed: resolved.serverSeed,
        serverSeedHash: resolved.serverSeedHash,
        clientSeed: bet.clientSeed,
        nonce: bet.nonce,
        outcome: grade.outcome,
        multiplier: grade.multiplier,
        draw: grade.draw,
      },
    }
  } catch (e) {
    // A bad bet parameter (unknown game, out-of-range target) is a client error, not a 500.
    return { status: 400, body: { error: e instanceof Error ? e.message : 'could not grade bet' } }
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

// Validate the server environment ONCE per process (cold start). In production a missing
// FAIRNESS_SECRET or a malformed knob throws here, so the function refuses to settle wagers on an
// insecure/misconfigured env instead of silently falling back to the dev secret. Off the hot
// path: unit tests call handleResolveBet directly and never reach this.
let serverEnvChecked = false
function ensureServerEnv(): void {
  if (serverEnvChecked) return
  validateServerEnv()
  serverEnvChecked = true
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ensureServerEnv()
  if (req.method !== 'POST') {
    send(res, 405, { error: 'method not allowed' })
    return
  }
  try {
    const body = (await readJson(req)) as ResolveBetRequest
    // Durable Supabase-backed vault when keys are present, else the stateless derived default.
    const result = await handleResolveBet(body, vaultFromEnv(ambientEnv()))
    send(res, result.status, result.body)
  } catch {
    send(res, 500, { error: 'resolve request failed' })
  }
}
