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
import { resolveCommit, type SeedVault } from '../core/fairness-authority.js'
import { gradeBet, type GradeRequest, type GradeResult } from '../games/grade.js'
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
 * Pure handler — Supabase-edge-portable. Reveals the round's seed through the authority,
 * then grades the bet with the server seed. Returns the authoritative outcome + multiplier
 * + the disclosed seed (so the player can verify). Injects the vault for testing.
 */
export async function handleResolveBet(
  req: ResolveBetRequest,
  vault: SeedVault = defaultVault(),
): Promise<ResolveBetResult> {
  if (!req?.commitId) return { status: 400, body: { error: 'commitId required' } }
  if (!req.bet || typeof req.bet.clientSeed !== 'string' || typeof req.bet.nonce !== 'number') {
    return { status: 400, body: { error: 'bet with clientSeed and nonce required' } }
  }
  const bet = req.bet
  try {
    // The SERVER reveals the seed and derives the outcome — the authoritative settlement.
    const resolved = await resolveCommit(vault, req.commitId, (serverSeed) =>
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

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'method not allowed' })
    return
  }
  try {
    const body = (await readJson(req)) as ResolveBetRequest
    // Durable Supabase-backed vault when keys are present, else the stateless derived default.
    const result = await handleResolveBet(body, vaultFromEnv(process.env))
    send(res, result.status, result.body)
  } catch {
    send(res, 500, { error: 'resolve request failed' })
  }
}
