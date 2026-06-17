/**
 * Pick'em entries — the MONEY path. Staking an entry HOLDS the stake through the shared
 * `core` (`placeWager` → `account.pending`); settling it pays the table multiplier through
 * `core` (`resolveAtMultiplier`). No separate money path, no module-local points — every
 * credit move serializes through the one Account, so entries roll into the figure, the
 * durable ledger, and weekly settlement automatically (book-store's onWagerResolved hook).
 *
 * State is an in-memory external store (subscribe / version), like the book's activity
 * store: a reload clears open holds, by the same live-session design. Credit/balance only.
 */

import {
  availableToWager,
  placeWager,
  resolveAtMultiplier,
  resolveWager,
  type Account,
  type Wager,
} from '../core/index.js'
import {
  FLEX_MIN_PICKS,
  MAX_PICKS,
  MIN_PICKS,
  modeAvailable,
  topMultiple,
  type PickemMode,
} from './config.js'
import { gradeEntry, hasContradiction, type PickResult, type PickSide } from './engine.js'
import { findProjection, type Projection } from './projections.js'
import { SAMPLE_ENTRY_SPECS } from './mock.js'

/** One leg of a placed entry — the projection captured at placement + its graded result. */
export interface EntryPick {
  projectionId: string
  playerId: string
  playerName: string
  statId: string
  statLabel: string
  line: number
  side: PickSide
  /** Set at settlement. */
  result?: PickResult
}

export interface PickemEntry {
  /** The core wager id this entry holds (the one stake at risk). */
  id: string
  accountId: string
  playerName: string
  mode: PickemMode
  picks: EntryPick[]
  stakeCents: number
  /** The multiple quoted for hitting every pick, at placement. */
  topMultiple: number
  status: 'open' | 'won' | 'lost' | 'void'
  placedAt: number
  settledAt?: number
  /** Realized total-return multiple (set at settlement). */
  payoutMultiple?: number
  /** Total returned on settlement (stake × realized multiple; 0 on a loss). */
  returnCents?: number
}

/** Live core refs for settlement (account + the held wager), kept in memory like the book. */
interface LiveEntry {
  account: Account
  wager: Wager
}
const live = new Map<string, LiveEntry>()

let entries: PickemEntry[] = []
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeEntries(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getEntriesVersion(): number {
  return version
}
/** Newest first. */
export function getEntries(): PickemEntry[] {
  return entries
}
/** A player's own entries (the "my entries" panel). */
export function entriesForAccount(accountId: string): PickemEntry[] {
  return entries.filter((e) => e.accountId === accountId)
}
/** Total still at risk across a set of entries (open holds), in cents. */
export function atRiskCents(list: PickemEntry[]): number {
  return list.filter((e) => e.status === 'open').reduce((sum, e) => sum + e.stakeCents, 0)
}
/** Clear all entries + live holds (tests / a fresh demo). */
export function __resetEntries(): void {
  entries = []
  live.clear()
  notify()
}

export interface PlaceEntryInput {
  account: Account
  playerName: string
  mode: PickemMode
  picks: Array<{ projection: Projection; side: PickSide }>
  /** Entry stake (the single amount on the whole ladder) — integer cents. */
  stakeCents: number
  now: number
}

/**
 * Place an entry: validate it, HOLD the stake via core, and record it open. Throws (placing
 * nothing) if the pick count is out of range, the mode isn't available for that count, two
 * picks share a player+stat, the stake is non-positive, or it doesn't fit availableToWager.
 */
export function placeEntry(input: PlaceEntryInput): PickemEntry {
  const { account, playerName, mode, picks, stakeCents, now } = input

  if (picks.length < MIN_PICKS || picks.length > MAX_PICKS) {
    throw new Error(`pick between ${MIN_PICKS} and ${MAX_PICKS} projections`)
  }
  if (!modeAvailable(mode, picks.length)) {
    throw new Error(`flex needs at least ${FLEX_MIN_PICKS} picks`)
  }
  if (
    hasContradiction(
      picks.map((p) => ({ playerId: p.projection.playerId, statId: p.projection.statId })),
    )
  ) {
    throw new Error('two picks on the same player & stat can’t be combined')
  }
  if (!Number.isInteger(stakeCents) || stakeCents <= 0) {
    throw new Error('enter a stake')
  }
  if (stakeCents > availableToWager(account)) {
    throw new Error('stake exceeds available to wager')
  }

  const wager = placeWager(account, stakeCents) // HOLD through core
  const entryPicks: EntryPick[] = picks.map((p) => ({
    projectionId: p.projection.id,
    playerId: p.projection.playerId,
    playerName: p.projection.playerName,
    statId: p.projection.statId,
    statLabel: p.projection.statLabel,
    line: p.projection.line,
    side: p.side,
  }))
  const entry: PickemEntry = {
    id: wager.id,
    accountId: account.id,
    playerName,
    mode,
    picks: entryPicks,
    stakeCents,
    topMultiple: topMultiple(mode, picks.length),
    status: 'open',
    placedAt: now,
  }
  live.set(entry.id, { account, wager })
  entries = [entry, ...entries]
  notify()
  return entry
}

/**
 * Settle an entry from its projections' graded results (projectionId → 'higher'|'lower'|
 * 'void'). Grades via the pure engine (power/flex, voids drop a leg), then SETTLES the held
 * wager at the resulting multiplier through core — one resolve call. Returns the final
 * status, or null if the entry is unknown / already settled.
 */
export function settleEntry(
  entryId: string,
  results: Record<string, PickResult>,
  now: number,
): PickemEntry['status'] | null {
  const lb = live.get(entryId)
  const entry = entries.find((e) => e.id === entryId)
  if (!lb || !entry || lb.wager.status === 'resolved' || entry.status !== 'open') return null

  const graded = gradeEntry(
    entry.mode,
    entry.picks.map((p) => ({ id: p.projectionId, side: p.side })),
    results,
  )
  // SETTLE through core. A voided entry (too few legs survived) returns the stake as a
  // VOID — not a push — so the core wager's outcome matches the entry status and void
  // handle is excluded from turnover/analytics. Everything else settles at the multiple.
  if (graded.status === 'void') {
    resolveWager(lb.account, lb.wager, 'void')
  } else {
    resolveAtMultiplier(lb.account, lb.wager, graded.multiplier)
  }

  const returnCents = Math.round(entry.stakeCents * graded.multiplier)
  const settledPicks = entry.picks.map((p) => ({ ...p, result: results[p.projectionId] ?? 'void' }))
  entries = entries.map((e) =>
    e.id === entryId
      ? {
          ...e,
          picks: settledPicks,
          status: graded.status,
          payoutMultiple: graded.multiplier,
          returnCents,
          settledAt: now,
        }
      : e,
  )
  live.delete(entryId)
  notify()
  return graded.status
}

/**
 * Seed demo entries (a POWER win, a FLEX partial, an open, a loss) on the CURRENT player's
 * account through the real money path, so "my entries" renders populated. No-op if the
 * account already has entries. Returns how many were placed.
 */
export function seedDemoEntries(account: Account, playerName: string, now: number): number {
  if (entriesForAccount(account.id).length > 0) return 0
  let seeded = 0
  SAMPLE_ENTRY_SPECS.forEach((spec, i) => {
    const picks = spec.picks
      .map((p) => {
        const projection = findProjection(p.projectionId)
        return projection ? { projection, side: p.side } : null
      })
      .filter((p): p is { projection: Projection; side: PickSide } => p !== null)
    if (picks.length < MIN_PICKS) return
    try {
      // stagger placedAt so the samples sort newest-first sensibly
      const placedAt = now - (SAMPLE_ENTRY_SPECS.length - i) * 60_000
      const entry = placeEntry({
        account,
        playerName,
        mode: spec.mode,
        picks,
        stakeCents: spec.stakeCents,
        now: placedAt,
      })
      if (spec.settle) settleEntry(entry.id, spec.settle, now)
      seeded += 1
    } catch {
      // insufficient credit / locked — skip this sample in the demo
    }
  })
  return seeded
}
