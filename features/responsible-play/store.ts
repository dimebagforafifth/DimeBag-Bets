/**
 * Responsible-play store — the app-layer owner of the persisted `player_limits`, mirroring the
 * economy-config pattern (app owns persistence, pushes policy into core).
 *
 * It (a) persists each player's configured limits, (b) rehydrates core at boot via
 * `installPlayerLimit` (verbatim, so a queued loosening keeps its schedule across a reload),
 * and (c) wires the core wager/loss gate's period-to-date usage reader to the durable book
 * ledger — so the SAME ledger the activity summary reconciles to is what the gate counts.
 *
 * Limits are PLAYER-OWNED: `setLimit` / `clearLimit` act on the player's own account. No money
 * path — these only configure the gate. OFF-BY-DEFAULT: an untouched book persists nothing and
 * installs nothing, so placement stays byte-identical.
 */

import {
  __resetLimits,
  clearPlayerLimit,
  getEffectiveLimits,
  getPlayerLimitState,
  installPlayerLimit,
  periodStartMs,
  setLimitUsageReader,
  setPlayerLimit,
  type ActiveLimit,
  type LimitInput,
  type LimitKind,
} from '../../core/index.js'
import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import { getBookLedger } from '../../app/book-ledger.js'
import { summarizeActivity, usageSince, type ActivitySummary } from './activity.js'

/** A persisted per-kind slot — exactly core's slot, so rehydration is verbatim. */
export interface StoredSlot {
  active: ActiveLimit
  pending: ActiveLimit | null
}

export interface LimitsDoc {
  /** playerId → kind → slot. Absent player = untracked (off-by-default). */
  players: Record<string, Partial<Record<LimitKind, StoredSlot>>>
}

const DEFAULT_DOC: LimitsDoc = { players: {} }

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<LimitsDoc> = persistedDoc<LimitsDoc>(store, 'responsible.limits', {
  version: 1,
  initial: DEFAULT_DOC,
})

let doc: LimitsDoc = DOC.load() ?? DEFAULT_DOC
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  DOC.save(doc)
  version += 1
  listeners.forEach((l) => l())
}

/* ------------------------------- boot wiring ------------------------------- */

/** Push every persisted slot into core verbatim (boot rehydration). */
function hydrateCore(): void {
  for (const [playerId, kinds] of Object.entries(doc.players)) {
    for (const [kind, slot] of Object.entries(kinds)) {
      if (slot) installPlayerLimit(playerId, kind as LimitKind, slot)
    }
  }
}

/** Point core's wager/loss gate at the durable ledger (the same source the summary reconciles
 *  to). Reads only RESOLVED turnover/result since the period start; moves no money. */
function wireUsageReader(): void {
  setLimitUsageReader((playerId, sinceMs) => usageSince(getBookLedger(), playerId, sinceMs))
}

// Boot: rehydrate core from disk, then wire the gate's usage source. Moves NO money.
hydrateCore()
wireUsageReader()

/* ------------------------------- subscription ------------------------------ */

export function subscribeLimits(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function getLimitsVersion(): number {
  return version
}

/** Persist the current core state for one player back into the doc (after a set/clear). */
function syncPlayer(playerId: string): void {
  const state = getPlayerLimitState(playerId)
  if (Object.keys(state).length === 0) {
    delete doc.players[playerId]
  } else {
    doc.players[playerId] = state as Partial<Record<LimitKind, StoredSlot>>
  }
  doc = { players: { ...doc.players } }
}

/* --------------------------------- actions --------------------------------- */

/**
 * Set/change one of a player's OWN limits. Tightening applies now; loosening is deferred by
 * core. Returns the resulting effective limit + whether it was deferred. No money moves.
 */
export function setLimit(
  playerId: string,
  input: LimitInput,
): { effective: ActiveLimit; deferred: boolean } {
  const result = setPlayerLimit(playerId, input)
  syncPlayer(playerId)
  notify()
  return result
}

/** Remove one of a player's limits (a loosening — deferred by core). */
export function clearLimit(playerId: string, kind: LimitKind): { deferred: boolean } {
  const result = clearPlayerLimit(playerId, kind)
  syncPlayer(playerId)
  notify()
  return result
}

/* ---------------------------------- reads ---------------------------------- */

/** A player's full per-kind limit state (active + any queued loosening), for the UI. */
export function limitStateOf(playerId: string): ReturnType<typeof getPlayerLimitState> {
  return getPlayerLimitState(playerId)
}

/** The limits in force right now for a player. */
export function effectiveLimitsOf(playerId: string): ReturnType<typeof getEffectiveLimits> {
  return getEffectiveLimits(playerId)
}

/**
 * Every player with a CURRENTLY-MEANINGFUL limit — a live cap/cool-off or a queued change (for
 * the operator read-only view). Filters out a lapsed removal still parked in the persisted doc,
 * so the view never shows an all-"—" row.
 */
export function limitedPlayerIds(): string[] {
  return Object.keys(doc.players).filter((id) => {
    if (Object.keys(getEffectiveLimits(id)).length > 0) return true
    return Object.values(getPlayerLimitState(id)).some((s) => s?.pending != null)
  })
}

/** A player's all-time activity summary, projected from the durable ledger. */
export function activityOf(playerId: string): ActivitySummary {
  return summarizeActivity(getBookLedger().filter((e) => e.accountId === playerId))
}

/** A player's activity since a timestamp (drives the day/week stat-sheet slices). */
export function activitySince(playerId: string, sinceMs: number): ActivitySummary {
  return summarizeActivity(
    getBookLedger().filter((e) => e.accountId === playerId && e.at >= sinceMs),
  )
}

/** Day / week / all-time stat-sheet slices for a player. */
export function activityBreakdown(
  playerId: string,
  now: number = Date.now(),
): { day: ActivitySummary; week: ActivitySummary; all: ActivitySummary } {
  return {
    day: activitySince(playerId, periodStartMs('day', now)),
    week: activitySince(playerId, periodStartMs('week', now)),
    all: activityOf(playerId),
  }
}

/* ------------------------------- test helper ------------------------------- */

/** Re-run boot rehydration from the persisted doc (tests simulate a reload: clear core via
 *  __resetLimits, then call this to prove the doc restores core's policy + the usage wiring). */
export function __hydrateFromDoc(): void {
  hydrateCore()
  wireUsageReader()
}

/** Reset the store + core limits to the off-by-default baseline (tests). Self-contained:
 *  clears the persisted doc, clears core's policy, and re-points the usage reader at the
 *  live ledger (core's reset drops the reader, so re-wire after). */
export function __resetResponsiblePlay(): void {
  doc = { players: {} }
  DOC.save(doc)
  version = 0
  __resetLimits()
  wireUsageReader()
}
