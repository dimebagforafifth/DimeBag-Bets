/**
 * The per-game / per-bet-type edge store behind the Casino Edge console tile (PART 2). Edge is
 * held in basis points and ALWAYS clamped into the game's band (app/game-edge-config.ts).
 *
 * Single source of truth, no drift:
 *  - A single-edge ADJUSTABLE game (Dice, Mines, … — app/edge-config isAdjustable) keeps its
 *    current edge in the existing edge-store (as RTP), so the live payout math follows. This
 *    store reads/writes it there (rtp ⇄ bps).
 *  - Per-bet-type edges (sic bo triple, roulette EU/US) and structural games keep their override
 *    here, keyed `gameId` or `gameId:betType`. // SEAM: wiring the per-bet-type / structural
 *    edges into those games' payout math is the integration step (they are a policy target now).
 *
 * Off-by-default: an empty store changes nothing (every game shows its band default). Mock/local
 * (persisted under 'dimebag') — no Supabase keys needed. Moves no money.
 */

import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import {
  bandFor,
  bpsToRtp,
  clampEdgeBps,
  rtpToBps,
  type GameEdgeBand,
} from '../game-edge-config.js'
import { isAdjustable, nativeRtp } from '../edge-config.js'
import { getRtp, hasOverride, resetRtp, setRtp, subscribeEdge } from '../edge-store.js'

/** key = `gameId` (main edge of a structural game) or `gameId:betType`. value = edge bps. */
type BandOverrides = Record<string, number>

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<BandOverrides> = persistedDoc<BandOverrides>(store, 'edge.bands', {
  version: 1,
  initial: {},
})

const overrides: BandOverrides = DOC.load()
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

const keyOf = (gameId: string, betType?: string): string =>
  betType ? `${gameId}:${betType}` : gameId

/** Subscribe to any edge change (this store OR the underlying edge-store for adjustable games). */
export function subscribeEdgeBands(listener: () => void): () => void {
  listeners.add(listener)
  const offEdge = subscribeEdge(listener)
  return () => {
    listeners.delete(listener)
    offEdge()
  }
}
export function getEdgeBandsVersion(): number {
  return version
}

/** Whether the main (single-edge) value of a game lives in the runtime edge-store. */
function backedByEdgeStore(gameId: string, betType?: string): boolean {
  return !betType && isAdjustable(gameId)
}

/**
 * Whether changing this game/bet-type's edge ACTUALLY moves live payouts today. Adjustable
 * single-edge games (Dice, Mines, …) are wired through the edge-store so their payout math
 * follows; per-bet-type edges (sic bo, roulette EU/US) and structural games are recorded as a
 * policy target but NOT yet read by those games' payout math (the SEAM noted above). The console
 * surfaces this so an operator isn't misled into thinking a structural edge change took effect.
 */
export function isEdgeApplied(gameId: string, betType?: string): boolean {
  return backedByEdgeStore(gameId, betType)
}

/** The current edge (bps) for a game / bet type — the live value, falling back to the band default. */
export function currentEdgeBps(gameId: string, betType?: string): number {
  if (backedByEdgeStore(gameId, betType)) {
    return rtpToBps(getRtp(gameId, nativeRtp(gameId)))
  }
  const o = overrides[keyOf(gameId, betType)]
  return o == null ? bandFor(gameId, betType).edge_default_bps : o
}

/** Whether this game/bet-type has a manager override (vs its band default). */
export function hasEdgeOverride(gameId: string, betType?: string): boolean {
  if (backedByEdgeStore(gameId, betType)) return hasOverride(gameId)
  return overrides[keyOf(gameId, betType)] != null
}

/** Set the edge (bps), clamped into the band, and persist. Adjustable single-edge games route to
 *  the edge-store (live payout follows); everything else is held here. */
export function setEdgeBps(gameId: string, bps: number, betType?: string): void {
  const clamped = clampEdgeBps(gameId, bps, betType)
  if (backedByEdgeStore(gameId, betType)) {
    setRtp(gameId, bpsToRtp(clamped)) // notifies edge-store subscribers
    return
  }
  overrides[keyOf(gameId, betType)] = clamped
  DOC.save(overrides)
  notify()
}

/** Drop the override, returning to the band default (and the game's native edge if adjustable). */
export function resetEdgeBps(gameId: string, betType?: string): void {
  if (backedByEdgeStore(gameId, betType)) {
    resetRtp(gameId)
    return
  }
  if (overrides[keyOf(gameId, betType)] == null) return
  delete overrides[keyOf(gameId, betType)]
  DOC.save(overrides)
  notify()
}

/** The band a game/bet-type is constrained to (for the slider bounds + readout). */
export function bandOf(gameId: string, betType?: string): GameEdgeBand {
  return bandFor(gameId, betType)
}

/** Test reset. */
export function __resetEdgeBands(): void {
  for (const k of Object.keys(overrides)) delete overrides[k]
  DOC.save(overrides)
  notify()
}
