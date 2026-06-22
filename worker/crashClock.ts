/**
 * Server-authoritative Crash round-clock.
 *
 * This is the piece serverless fundamentally can't host: a persistent loop that runs the round
 * timer, ticks the multiplier, and — crucially — WITHHOLDS the crash point until the round
 * busts. Today Crash takes the fairness reveal at bet time and runs a client-timed clock
 * (marked INTERIM in the game's start()); this worker is the path that closes that seam
 * (docs/provably-fair-server.md → "Server-timed Crash clock").
 *
 * Fairness (unchanged math, core/fair.ts):
 *   • Before the round: commit() returns {commitId, serverSeedHash}. We broadcast the HASH only
 *     — the seed is withheld, so neither operator nor player can know the crash point yet.
 *   • During the round: the server holds the crash point privately and only streams the rising
 *     multiplier. Clients cannot compute the bust ahead of the server.
 *   • At bust: we reveal the serverSeed so any client can re-derive crashPoint and verify
 *     sha256(serverSeed) === serverSeedHash.
 *
 * Money: this loop does NOT move money. Wagers settle through `core` on the resolve path
 * (api/resolve-bet + the Supabase money RPCs). The clock's job is the authoritative timeline +
 * the verifiable result; binding each player's stake/cashout to a round is the money lane's
 * seam (TODO markers below).
 *
 * Transport: round state is published over Supabase Realtime broadcast on `crash:lobby`. With
 * no Supabase configured, it logs the timeline instead (still fully runnable for local dev).
 */
import { createDerivedVault, resolveMasterSecret } from '../core/fairness-authority.js'
import { crashPointFromSeeds } from '../games/crash/fair.js'
import { multiplierAt, elapsedForMultiplier } from '../games/crash/curve.js'
import { getServiceClient } from './supabase.js'

const BETTING_MS = num('CRASH_BETTING_MS', 5000) // open-bet window before lift-off
const TICK_MS = num('CRASH_TICK_MS', 100) // multiplier broadcast cadence
const COOLDOWN_MS = num('CRASH_COOLDOWN_MS', 3000) // pause between rounds
const CHANNEL = 'crash:lobby'

function num(name: string, dflt: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : dflt
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type Publisher = (event: string, payload: Record<string, unknown>) => void

/** Build a broadcaster over Supabase Realtime, or a console fallback when unconfigured. */
async function makePublisher(log: (m: string) => void): Promise<Publisher> {
  const client = getServiceClient()
  if (!client) {
    log('[crash] no Supabase — broadcasting to console only')
    return (event, payload) => log(`[crash] ${event} ${JSON.stringify(payload)}`)
  }
  const channel = client.channel(CHANNEL, { config: { broadcast: { ack: false } } })
  await new Promise<void>((resolve) => channel.subscribe(() => resolve()))
  log(`[crash] broadcasting on Realtime "${CHANNEL}"`)
  return (event, payload) => {
    void channel.send({ type: 'broadcast', event, payload })
  }
}

export interface CrashClockHandle {
  stop(): void
}

export function startCrashClock(log: (msg: string) => void = console.log): CrashClockHandle {
  const secret = resolveMasterSecret(process.env)
  if (secret.isDevFallback) {
    log('[crash] WARNING: FAIRNESS_SECRET unset — using dev fallback seed (local play only)')
  }
  const vault = createDerivedVault(secret.secret)
  let running = true
  let nonce = 0

  ;(async () => {
    const publish = await makePublisher(log)

    while (running) {
      nonce += 1
      // 1) Commit BEFORE the round — broadcast the hash, withhold the seed.
      const { commitId, serverSeedHash } = await vault.commit()
      const clientSeed = `round:${commitId}` // server-chosen per-round client seed
      publish('round_open', { commitId, serverSeedHash, clientSeed, nonce, bettingMs: BETTING_MS })

      // 2) Betting window. TODO(money): bind each accepted wager's (commitId, clientSeed, nonce)
      //    server-side here so the standalone reveal is fully grind-proof (Supabase money lane).
      await sleep(BETTING_MS)
      if (!running) break

      // 3) Reveal server-side ONLY (not to clients yet) and derive the crash point privately.
      const { serverSeed } = await vault.reveal(commitId)
      const crashPoint = crashPointFromSeeds(serverSeed, clientSeed, nonce)
      const bustMs = elapsedForMultiplier(crashPoint)
      publish('round_start', { commitId, startedAt: Date.now() })

      // 4) Tick the rising multiplier without leaking the crash point.
      const startedAt = Date.now()
      for (;;) {
        if (!running) break
        const elapsed = Date.now() - startedAt
        if (elapsed >= bustMs) break
        publish('tick', { commitId, multiplier: multiplierAt(elapsed) })
        await sleep(TICK_MS)
      }
      if (!running) break

      // 5) Bust — NOW reveal the seed so clients can verify, and publish the result. The money
      //    lane settles each open wager (win at cashout multiplier / loss) on the resolve path.
      publish('bust', { commitId, crashPoint, serverSeed, serverSeedHash, clientSeed, nonce })
      // TODO(money): trigger settlement of this round's open wagers via core / api/resolve-bet.

      await sleep(COOLDOWN_MS)
    }
    log('[crash] clock loop exited')
  })().catch((err) => log(`[crash] fatal: ${String(err)}`))

  return {
    stop() {
      running = false
      log('[crash] clock stopping…')
    },
  }
}
