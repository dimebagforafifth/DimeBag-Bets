/**
 * Responsible-play tools (CLAUDE.md §2, §4 — honest by default). Player-set safer-
 * gambling limits that ACTUALLY block over-limit play, layered entirely on top of
 * the public core interface — it moves no money and never edits the money model.
 *
 * Two kinds of state:
 *  - LIMITS a player sets (per-bet cap, session loss cap, session time cap, and a
 *    "take a break" cooldown). Persisted, so they survive reloads.
 *  - SESSION figures (when this play session began, net result, bets). In-memory,
 *    session-only — a reload starts a fresh session, like the casino feed.
 *
 * The store tracks the session by listening to core's place/resolve events (the
 * same read-only pattern app/vip-store uses). The pure `evaluatePlay` decides if
 * play is allowed; the gate (app/ResponsiblePlayGate) and the sportsbook slip call
 * it. Nothing here engages the cross-game resolving lock or touches `core`.
 */

import { onWagerPlaced, onWagerResolved } from '../core/index.js'
import { createLocalStore, persistedDoc, type Doc } from '../persistence/index.js'

export interface PlayerLimits {
  /** Largest single stake allowed, in cents. */
  perBetMax?: number
  /** Stop play once net loss this session reaches this many cents. */
  sessionLossLimit?: number
  /** Stop play once this session has run this many minutes. */
  sessionMinutes?: number
  /** Epoch ms until which the player has chosen to take a break (self-exclusion). */
  cooldownUntil?: number
}

export interface SessionState {
  /** When the current session began (epoch ms), or null if none is active. */
  startedAt: number | null
  /** Net result this session in cents (signed; negative = a net loss). */
  netCents: number
  /** Bets placed this session. */
  bets: number
  /** Last activity (epoch ms) — a long gap starts a fresh session. */
  lastAt: number
}

export type BlockKind = 'cooldown' | 'loss' | 'time' | 'perBet'

export interface PlayCheck {
  allowed: boolean
  kind?: BlockKind
  reason?: string
  /** For a cooldown block, when it lifts (epoch ms). */
  until?: number
}

/** A gap longer than this between bets starts a fresh session. */
export const SESSION_IDLE_RESET_MS = 30 * 60_000

const freshSession = (now = 0): SessionState => ({ startedAt: null, netCents: 0, bets: 0, lastAt: now })

/** Net loss this session in cents (0 when the session is up or even). Pure. */
export function netLossCents(s: SessionState): number {
  return Math.max(0, -s.netCents)
}

/** Minutes elapsed in the current session at `now`. Pure. */
export function sessionMinutesElapsed(s: SessionState, now: number): number {
  if (s.startedAt == null) return 0
  return Math.max(0, (now - s.startedAt) / 60_000)
}

/**
 * Decide whether play is allowed right now. Pure — the single source of the
 * blocking rules, exercised directly by tests. Pass `stake` to also apply the
 * per-bet cap; omit it to check only the session/cooldown blocks (the gate).
 */
export function evaluatePlay(
  limits: PlayerLimits,
  session: SessionState,
  now: number,
  stake?: number,
): PlayCheck {
  if (limits.cooldownUntil != null && now < limits.cooldownUntil) {
    return { allowed: false, kind: 'cooldown', until: limits.cooldownUntil, reason: 'You’re taking a break.' }
  }
  if (limits.sessionLossLimit != null && netLossCents(session) >= limits.sessionLossLimit) {
    return { allowed: false, kind: 'loss', reason: 'You’ve reached your session loss limit.' }
  }
  if (
    limits.sessionMinutes != null &&
    session.startedAt != null &&
    sessionMinutesElapsed(session, now) >= limits.sessionMinutes
  ) {
    return { allowed: false, kind: 'time', reason: 'You’ve reached your session time limit.' }
  }
  if (stake != null && limits.perBetMax != null && stake > limits.perBetMax) {
    return { allowed: false, kind: 'perBet', reason: 'That stake is over your per-bet limit.' }
  }
  return { allowed: true }
}

/* ------------------------------- the store ------------------------------- */

const store = createLocalStore({ namespace: 'dimebag' })
const LIMITS_DOC: Doc<Record<string, PlayerLimits>> = persistedDoc<Record<string, PlayerLimits>>(
  store,
  'responsible-play.limits',
  { version: 1, initial: {} },
)

const limits: Record<string, PlayerLimits> = LIMITS_DOC.load()
const sessions = new Map<string, SessionState>()
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeResponsiblePlay(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getResponsiblePlayVersion(): number {
  return version
}

/** A player's saved limits (a stable empty object for an unset player). */
export function getLimits(playerId: string): PlayerLimits {
  return limits[playerId] ?? {}
}

/** Merge a patch into a player's limits; clears a key when its value is undefined. */
export function setLimits(playerId: string, patch: Partial<PlayerLimits>): void {
  const next: PlayerLimits = { ...limits[playerId] }
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) delete (next as Record<string, unknown>)[k]
    else (next as Record<string, unknown>)[k] = v
  }
  limits[playerId] = next
  LIMITS_DOC.save(limits)
  notify()
}

/** Start (or extend) a "take a break" cooldown of `ms` from `now`. */
export function startCooldown(playerId: string, ms: number, now = Date.now()): void {
  setLimits(playerId, { cooldownUntil: now + ms })
}

/** The player's current (in-memory) session figures. */
export function getSession(playerId: string): SessionState {
  return sessions.get(playerId) ?? freshSession()
}

/** Clear the player's session (a fresh start — used after a break). */
export function resetSession(playerId: string): void {
  sessions.delete(playerId)
  notify()
}

function ensureSession(playerId: string, now: number): SessionState {
  let s = sessions.get(playerId)
  if (!s || s.startedAt == null || now - s.lastAt > SESSION_IDLE_RESET_MS) {
    s = { startedAt: now, netCents: 0, bets: 0, lastAt: now }
    sessions.set(playerId, s)
  }
  return s
}

/** Record a placed bet — starts/continues the session. (Driven by core events.) */
export function noteBet(playerId: string, _stakeCents: number, now = Date.now()): void {
  const s = ensureSession(playerId, now)
  s.bets += 1
  s.lastAt = now
  notify()
}

/** Record a resolved bet's profit (signed cents) into the session net. */
export function noteResult(playerId: string, profitCents: number, now = Date.now()): void {
  const s = sessions.get(playerId)
  if (!s || s.startedAt == null) return
  s.netCents += profitCents
  s.lastAt = now
  notify()
}

/** Evaluate the player's current limits + session (optionally with a stake). */
export function checkPlay(playerId: string, now = Date.now(), stake?: number): PlayCheck {
  return evaluatePlay(getLimits(playerId), getSession(playerId), now, stake)
}

/** The effective per-bet cap for a player (Infinity when unset) — used to clamp
 *  the sportsbook/casino max stake alongside core's own limits. */
export function perBetCap(playerId: string): number {
  return getLimits(playerId).perBetMax ?? Infinity
}

// Wire the session tracker to core's read-only event stream (like vip-store). The
// account id IS the player id. Never mutates the account; pure bookkeeping.
// TODO(api): when accounts move server-side, this same tracker subscribes to the
// server's place/resolve stream — nothing here changes.
onWagerPlaced((e) => noteBet(e.accountId, e.stake))
onWagerResolved((e) => noteResult(e.accountId, e.profit))
