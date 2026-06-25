/**
 * Vercel Serverless Function — runs ONE scheduled-promos cycle. A scheduler (Vercel Cron or
 * an external pinger) hits this on a repeating interval so recurring/scheduled bonuses fire
 * even when nobody has the app open (the in-app runner only ticks while a tab is live). The
 * SCHEDULE lives outside the function — serverless is stateless and can't hold a setInterval.
 *
 * Cost discipline (mirrors api/poll-odds.ts): runScheduledPromosCron is mock-safe — with no
 * Supabase keys it's a no-op, so the cron can fire harmlessly. When CRON_SECRET is set the
 * caller must send `Authorization: Bearer <CRON_SECRET>` (Vercel Cron does this), so the
 * route can't be triggered by anyone.
 *
 * Money moves only through the server-authoritative grant path inside the worker's `send`
 * dispatcher (see persistence/promo-cron.ts + docs/operations/provisioning.md) — never in this handler.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { runScheduledPromosCron } from '../persistence/index.js'
import { getServerEnv, validateServerEnv } from '../lib/env.js'

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

// Validate the server environment once per process (cold start) — loud-fail in production on a
// malformed knob; warn-and-continue locally. This route takes no request body; its only
// untrusted input is the optional Bearer secret checked below.
let serverEnvChecked = false
function ensureServerEnv(): void {
  if (serverEnvChecked) return
  validateServerEnv()
  serverEnvChecked = true
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ensureServerEnv()
  const secret = getServerEnv().CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    send(res, 401, { error: 'unauthorized' })
    return
  }
  try {
    // No `send` dispatcher is wired here yet: the server-side bonus grant needs the book/org
    // hydrated server-side (TODO(api), see docs/operations/provisioning.md). Until then the live cron
    // reports ran:false and advances nothing — no scheduled bonus is lost.
    const result = await runScheduledPromosCron()
    send(res, 200, { ok: true, at: new Date().toISOString(), ...result })
  } catch {
    send(res, 500, { ok: false, error: 'promo cycle failed' })
  }
}
