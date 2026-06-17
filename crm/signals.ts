/**
 * Integrity signals (device / IP / session / referral) — the data multi-account &
 * collusion detection needs, which the app does NOT record anywhere today.
 *
 * // SEAM(crm): there is no device/IP/session telemetry in the app. Until auth/
 * session tracking exists, this synthesizes a DETERMINISTIC signals layer keyed on
 * player id (stable across renders + tests), and deliberately weaves a few accounts
 * into shared-device / shared-IP / referral rings so abuse detection renders
 * populated in the demo. Replace `synthSignals` with a real telemetry read later;
 * everything downstream (crm/abuse.ts) consumes the PlayerSignals shape unchanged.
 */

import type { PlayerSignals, SessionStamp } from './types.js'

const DAY = 86_400_000

/** FNV-1a 32-bit — a tiny, stable, dependency-free string hash for determinism. */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A stable pseudo-random in [0,1) for a (seed,key) pair — no Math.random, so the
 *  whole signals layer is reproducible. */
function rnd(seed: string, key: string): number {
  return hash32(`${seed}:${key}`) / 0xffffffff
}

export interface SignalMember {
  id: string
  name?: string
}

/**
 * Build the signals map for a roster. Deterministic given (members, now).
 * Rings are applied adaptively so they only form when the roster is big enough:
 *  - a shared-device pair (one person, two accounts) when ≥4 players
 *  - a shared-IP trio (household / co-located) when ≥7 players
 *  - a referral ring (one account farming referrals) when ≥6 players
 * Everyone else gets a unique device + network.
 */
export function synthSignals(members: SignalMember[], now: number): Map<string, PlayerSignals> {
  // stable order so ring membership is reproducible regardless of input order
  const players = [...members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const n = players.length
  const out = new Map<string, PlayerSignals>()

  // Adaptive ring assignments (by sorted index).
  const sharedDevice = n >= 4 ? new Set([0, 3]) : new Set<number>()
  const sharedIp = n >= 7 ? new Set([1, 4, 6]) : new Set<number>()
  const referralRing = n >= 6 ? { farmer: 1, referred: [2, 5] } : null

  players.forEach((m, i) => {
    const seed = m.id
    // signup spread over the last ~120 days (also the cohort-entry time)
    const ageDays = 1 + Math.floor(rnd(seed, 'age') * 119)
    const signupAt = now - ageDays * DAY

    // device: unique unless in the shared-device ring
    const deviceIds = [sharedDevice.has(i) ? 'dev_ring_alpha' : `dev_${hash32(seed).toString(36)}`]
    // a small share of players legitimately use a 2nd device
    if (rnd(seed, 'dev2') > 0.82) deviceIds.push(`dev_${hash32(seed + 'b').toString(36)}`)

    // network: unique unless in the shared-IP ring
    const ipHashes = [sharedIp.has(i) ? 'net_ring_beta' : `net_${hash32(seed + 'ip').toString(36)}`]

    // referral ring: the referred accounts point at the farmer
    let referrerId: string | undefined
    if (referralRing && referralRing.referred.includes(i))
      referrerId = players[referralRing.farmer].id

    // sessions: a handful over the player's lifetime, clustered toward "now" by recency
    const sessionCount = 3 + Math.floor(rnd(seed, 'sc') * 12)
    const recencyDays = Math.floor(rnd(seed, 'rec') * Math.min(ageDays, 30))
    const sessions: SessionStamp[] = []
    for (let s = 0; s < sessionCount; s++) {
      const back = recencyDays + Math.floor(rnd(seed, `s${s}`) * Math.max(1, ageDays - recencyDays))
      sessions.push({
        at: now - back * DAY - Math.floor(rnd(seed, `h${s}`) * DAY),
        deviceId: deviceIds[Math.floor(rnd(seed, `sd${s}`) * deviceIds.length)],
        ipHash: ipHashes[0],
        durationMin: 4 + Math.floor(rnd(seed, `dur${s}`) * 75),
      })
    }
    sessions.sort((a, b) => b.at - a.at)

    out.set(m.id, { playerId: m.id, signupAt, deviceIds, ipHashes, sessions, referrerId })
  })

  return out
}
