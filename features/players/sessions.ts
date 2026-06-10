/**
 * Players-lane session / IP access log (NEW — no real source exists yet).
 *
 * The auth module (auth/useAuth) only exposes the CURRENT operator session; nothing in
 * the app records a per-player sign-in history, device, or IP. The Sessions/IP panel
 * needs that, so this module synthesizes a DETERMINISTIC access log from the live
 * player roster (a seeded PRNG keyed by player id), stable across reloads + test runs.
 *
 * It surfaces the operational signals a book actually watches for: SHARED IPs (one IP
 * used by 2+ players — possible multi-accounting) and SUSPICIOUS sign-ins (a shared IP,
 * a failed attempt, or an unusual spread of distinct IPs for one player).
 *
 * // TODO(api): replace this synthesized log with the real auth/session feed (Supabase
 * // Auth session rows: device, ip, user_agent, last_seen). The AccessEvent shape below
 * // mirrors what that feed will provide so the panel doesn't change when it lands.
 */

import { getBook } from '../../app/book-store.js'
import { membersByRole } from '../../org/index.js'
import { rngFor, pick } from './rng.js'

export interface AccessEvent {
  id: string
  playerId: string
  playerName: string
  /** Epoch ms of the sign-in. */
  at: number
  device: string
  ip: string
  location: string
  status: 'ok' | 'failed'
}

const DEVICES = ['iPhone 15', 'Pixel 8', 'MacBook Pro', 'Windows 11 PC', 'iPad Air', 'Galaxy S24'] as const
const LOCATIONS = ['Austin, TX', 'Reno, NV', 'Miami, FL', 'Newark, NJ', 'Phoenix, AZ', 'Chicago, IL'] as const
const DAY = 86_400_000
const HOUR = 3_600_000

/** A small pool of IPs. Two players are deliberately steered onto a SHARED IP (so the
 *  shared-IP signal is exercised) by mixing in this hot-spot for a slice of the roster. */
const IP_POOL = [
  '24.18.55.10',
  '70.112.9.204',
  '99.43.180.22',
  '173.66.201.5',
  '45.12.88.130',
  '208.54.7.99',
]
const SHARED_IP = '203.0.113.77' // RFC-5737 documentation range — clearly synthetic

let cache: AccessEvent[] | null = null

/** Build the full access log for the current roster, newest-first. Cached; call
 *  `__resetSessions()` (tests) to rebuild after the roster changes. */
export function allSessions(): AccessEvent[] {
  if (cache) return cache
  const players = membersByRole(getBook(), 'player')
  const base = Date.now()
  const events: AccessEvent[] = []
  players.forEach((p, idx) => {
    const rnd = rngFor(`sess:${p.id}`)
    const count = 3 + Math.floor(rnd() * 5) // 3..7 sign-ins
    // Every 3rd & 4th player share the hot-spot IP at least once — multi-accounting bait.
    const onShared = idx % 3 === 0 || idx % 3 === 1 ? idx % 3 === 0 : false
    for (let i = 0; i < count; i++) {
      const useShared = onShared && i === 0
      events.push({
        id: `${p.id}-s${i}`,
        playerId: p.id,
        playerName: p.name,
        at: base - Math.floor(rnd() * 14) * DAY - Math.floor(rnd() * 24) * HOUR - i * 37 * HOUR,
        device: pick(DEVICES, rnd()),
        ip: useShared ? SHARED_IP : pick(IP_POOL, rnd()),
        location: useShared ? 'Unknown (proxy)' : pick(LOCATIONS, rnd()),
        status: rnd() < 0.08 ? 'failed' : 'ok',
      })
    }
  })
  cache = events.sort((a, b) => b.at - a.at)
  return cache
}

/** Sign-ins for one player, newest-first. */
export function sessionsFor(playerId: string): AccessEvent[] {
  return allSessions().filter((e) => e.playerId === playerId)
}

/** When a player was last seen (latest successful sign-in), or null if never. */
export function lastActiveFor(playerId: string): number | null {
  const ok = sessionsFor(playerId).find((e) => e.status === 'ok')
  return ok ? ok.at : null
}

/** IPs used by 2+ distinct players — the shared-IP / multi-accounting signal. */
export function sharedIps(): Set<string> {
  const byIp = new Map<string, Set<string>>()
  for (const e of allSessions()) {
    const set = byIp.get(e.ip) ?? new Set<string>()
    set.add(e.playerId)
    byIp.set(e.ip, set)
  }
  const shared = new Set<string>()
  for (const [ip, players] of byIp) if (players.size >= 2) shared.add(ip)
  return shared
}

/** Players to flag: any on a shared IP, any failed attempt, or 4+ distinct IPs. */
export function suspiciousPlayerIds(): Set<string> {
  const shared = sharedIps()
  const ipsByPlayer = new Map<string, Set<string>>()
  const flagged = new Set<string>()
  for (const e of allSessions()) {
    const set = ipsByPlayer.get(e.playerId) ?? new Set<string>()
    set.add(e.ip)
    ipsByPlayer.set(e.playerId, set)
    if (shared.has(e.ip) || e.status === 'failed') flagged.add(e.playerId)
  }
  for (const [pid, ips] of ipsByPlayer) if (ips.size >= 4) flagged.add(pid)
  return flagged
}

/** Reset the synthesized log (used after the roster changes, and in tests). */
export function __resetSessions(): void {
  cache = null
}
