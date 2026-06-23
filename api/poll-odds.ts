/**
 * Vercel Serverless Function — runs ONE odds poll cycle. A scheduler (Vercel Cron, an
 * external uptime pinger, or the local loop) hits this on a repeating interval to keep
 * the Supabase odds cache fresh; serverless is stateless, so the SCHEDULE lives outside
 * the function (it can't hold a setInterval). See docs/odds-and-fairness/odds-polling.md.
 *
 * Cost discipline: runPollCycle only calls the real SGO feed when SGO_LIVE=1. In the
 * default (mock) mode this route is a no-op — the cron can fire harmlessly, burning no
 * quota. Auth: when CRON_SECRET is set, the caller must send `Authorization: Bearer
 * <CRON_SECRET>` (Vercel Cron sends this automatically), so the route can't be triggered
 * by anyone to drain quota.
 *
 * No money is touched here — odds only (CLAUDE.md §3/§4). Credits/balance live in `core`.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { runPollCycle } from '../lib/odds/schedule.js'

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    send(res, 401, { error: 'unauthorized' })
    return
  }
  try {
    const result = await runPollCycle()
    send(res, 200, { ok: true, at: new Date().toISOString(), ...result })
  } catch {
    // Never leak internals (e.g. a URL); keep the message generic. The cache holds its
    // last good slate on a failed cycle.
    send(res, 500, { ok: false, error: 'poll cycle failed' })
  }
}
