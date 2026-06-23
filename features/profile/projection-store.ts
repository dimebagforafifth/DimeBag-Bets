/**
 * The materialized player-profile projection (`player_profile_stats_mv`).
 *
 * A READ-ONLY cache of the per-player, per-window stats, recomputed from the audited ledger on
 * each SETTLEMENT event (and when new bets settle). It holds NO money and exposes no mutator —
 * `rebuild` drops the cache and re-derives every value purely from the ledger, so the view is
 * always reconcilable to (and rebuildable from) the source of truth. `reconcile()` proves it:
 * Σ net_cents over the projection equals the ledger net exactly (no inflation).
 *
 * EXTENDS the records lane: it sources the same settled BetRows (toBetRows over the durable
 * book-ledger) and the same demo seed, so projection + verified records never disagree.
 */

import { toBetRows, type BetRow } from '../../app/ledger-stats.js'
import { getBookLedger, subscribeBookLedger } from '../../app/book-ledger.js'
import { listPlayers } from '../../app/book-store.js'
import { subscribeSettlements } from '../../app/settlement-store.js'
import { seededRows, seededClv, seededAccountIds } from '../records/seed.js'
import type { ClvDatum } from '../records/types.js'
import { projectPlayer, type ProfileStatBlock, type StatWindow } from './projection.js'

const DAY_MS = 24 * 60 * 60 * 1000
/** Default rolling "season" length when no absolute season start is pinned (120 days). */
export const SEASON_MS = 120 * DAY_MS

// Demo seeding mirrors records/store: ON for the mock/local default so every profile renders
// populated; a real keyed deployment flips it OFF so the projection derives purely from the
// server-authoritative ledger. SEAM (the wiring pass flips it with the records seed).
let seedEnabled = true
// An absolute season anchor (epoch ms); null = a rolling SEASON_MS window from `now`.
let seasonStartMs: number | null = null

let mv = new Map<string, Record<StatWindow, ProfileStatBlock>>()
let builtAt = 0
let dirty = true
let version = 0
const listeners = new Set<() => void>()
let wired = false

function realClv(_accountId: string): ClvDatum[] {
  return [] // no closing lines in the ledger yet — CLV honestly gated (see records/clv). SEAM.
}

/** Group every settled ledger row by account once (cheaper than re-scanning per player). */
function rowsByAccount(): Map<string, BetRow[]> {
  const by = new Map<string, BetRow[]>()
  for (const r of toBetRows(getBookLedger())) {
    const g = by.get(r.accountId)
    if (g) g.push(r)
    else by.set(r.accountId, [r])
  }
  return by
}

/**
 * Drop the materialized view and recompute it from the ledger. The player set is every account
 * that appears in the ledger ∪ the current roster ∪ (when seeding) the demo ids — so a player
 * with no bets still gets a zeroed projection, and EVERY ledger account is covered (which is
 * what makes `reconcile` exact). Pure w.r.t. the ledger; writes only the cache.
 */
export function rebuild(now: number = Date.now(), opts: { seasonStartMs?: number } = {}): void {
  const season = opts.seasonStartMs ?? seasonStartMs ?? now - SEASON_MS
  const ledgerRows = rowsByAccount()
  const ids = new Set<string>(ledgerRows.keys())
  for (const p of listPlayers()) ids.add(p.id)
  if (seedEnabled) for (const id of seededAccountIds()) ids.add(id)

  const next = new Map<string, Record<StatWindow, ProfileStatBlock>>()
  for (const id of ids) {
    const real = ledgerRows.get(id) ?? []
    const rows = seedEnabled ? [...real, ...seededRows(id, now)] : real
    const clv = [...realClv(id), ...(seedEnabled ? seededClv(id, now) : [])]
    next.set(id, projectPlayer(id, rows, clv, now, season))
  }
  mv = next
  builtAt = now
  dirty = false
  version += 1
  for (const l of listeners) l()
}

/** Build lazily on first read if the cache is cold/stale (materialized-view semantics). */
function ensureFresh(now: number = Date.now()): void {
  if (dirty || mv.size === 0) rebuild(now)
}

/* --------------------------------- read API (SEAM for Lanes B/D) ---------- */

/** A player's full projection (all four windows), or null if they have none. */
export function getPlayerProjection(playerId: string): Record<StatWindow, ProfileStatBlock> | null {
  ensureFresh()
  return mv.get(playerId) ?? null
}

/** One window's stats for a player (the leaderboard/profile read). */
export function getProfileStats(playerId: string, window: StatWindow): ProfileStatBlock | null {
  ensureFresh()
  return mv.get(playerId)?.[window] ?? null
}

/** Every player's projection (for leaderboards / discovery — Lane B). */
export function getAllProjections(): Map<string, Record<StatWindow, ProfileStatBlock>> {
  ensureFresh()
  return mv
}

/** When the view was last materialized (epoch ms). */
export function getProjectionBuiltAt(): number {
  return builtAt
}

/* --------------------------------- reconciliation ------------------------- */

export interface Reconciliation {
  /** Σ net_cents across the projection's 'all' window. */
  projectionNetCents: number
  /** Σ profit across every settled ledger resolution (the source of truth). */
  ledgerNetCents: number
  /** Σ net contributed by demo-seeded rows (0 when seeding is off). */
  seedNetCents: number
  /** True when the projection equals the ledger + seed exactly — i.e. it invented nothing. */
  reconciled: boolean
}

/**
 * Prove the cardinal invariant: the projection mints nothing. Σ net_cents over the projection
 * equals the ledger net (+ the demo seed when enabled). With seeding off this is Σ projection ==
 * Σ ledger exactly.
 */
export function reconcile(now: number = Date.now()): Reconciliation {
  ensureFresh(now)
  let projectionNetCents = 0
  for (const blocks of mv.values()) projectionNetCents += blocks.all.netCents
  const ledgerNetCents = toBetRows(getBookLedger()).reduce((a, r) => a + r.profit, 0)
  let seedNetCents = 0
  if (seedEnabled) {
    for (const id of mv.keys()) seedNetCents += seededRows(id, builtAt).reduce((a, r) => a + r.profit, 0)
  }
  return {
    projectionNetCents,
    ledgerNetCents,
    seedNetCents,
    reconciled: projectionNetCents === ledgerNetCents + seedNetCents,
  }
}

/* --------------------------------- live wiring + season ------------------- */

/** Recompute on every settlement (the spec trigger) and as new bets settle. Idempotent. */
function ensureWired(): void {
  if (wired) return
  wired = true
  subscribeSettlements(() => {
    dirty = true
    rebuild()
  })
  subscribeBookLedger(() => {
    dirty = true
  })
}

export function subscribeProjection(listener: () => void): () => void {
  ensureWired()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getProjectionVersion(): number {
  return version
}

/** Pin an absolute season start (epoch ms), or null for a rolling SEASON_MS window. Marks the
 *  view dirty so the next read rebuilds. */
export function setSeasonStart(ms: number | null): void {
  seasonStartMs = ms
  dirty = true
}
export function getSeasonStart(): number | null {
  return seasonStartMs
}

/* --------------------------------- test helpers --------------------------- */

export function __setProjectionSeed(enabled: boolean): void {
  seedEnabled = enabled
  dirty = true
}
export function __resetProjection(): void {
  seedEnabled = true
  seasonStartMs = null
  mv = new Map()
  builtAt = 0
  dirty = true
  version += 1
}
