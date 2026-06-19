/**
 * The house-edge store — the live, persisted per-book RTP overrides a manager
 * sets in the Management screen. Same pattern as app/book-store.ts and
 * app/vip-store.ts: a framework-agnostic external store (subscribe / version
 * snapshot) mirrored into React with `useSyncExternalStore`, persisted via
 * `persistedDoc` under namespace 'dimebag'.
 *
 * It holds ONLY explicit overrides, keyed by a game's registry key. An ABSENT
 * entry means "use the game's native edge", so an empty config (the ship state)
 * changes nothing until a manager moves a slider. The chosen RTP is converted to
 * each game's real houseConfig in app/edge-config.ts and fed into its payout math
 * — money still flows only through `core` (CLAUDE.md §3); this store moves none.
 *
 * One Org/book per browser, so this single doc IS the per-book setting. If
 * multiple books/managers ever coexist, key the doc by `org.managerId`.
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import { bpsToRtp, clampEdgeBps, rtpToBps } from './game-edge-config.js'

/** gameKey → RTP override. Absent ⇒ the game's native edge. The stored RTP corresponds to an
 *  edge inside the game's PER-GAME band (app/game-edge-config.ts), not the old flat 5% floor. */
export type EdgeConfig = Record<string, number>

const store = createStore({ namespace: 'dimebag' })
const EDGE_DOC: Doc<EdgeConfig> = persistedDoc<EdgeConfig>(store, 'edge.config', {
  version: 1,
  initial: {},
})

const config: EdgeConfig = EDGE_DOC.load()
migrateToBands(config)
const listeners = new Set<() => void>()
// Mutated in place (stable reference), so a version counter gives
// useSyncExternalStore a changing snapshot to re-render on.
let version = 0

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

/** Subscribe to override changes (used by App + the panel via useSyncExternalStore). */
export function subscribeEdge(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getEdgeVersion(): number {
  return version
}

export function getEdgeConfig(): EdgeConfig {
  return config
}

/** The effective RTP for a game: the manager override, or its native RTP. */
export function getRtp(gameKey: string, nativeRtp: number): number {
  const override = config[gameKey]
  return override == null ? nativeRtp : override
}

/** Whether a game currently has a manager override (vs its native edge). */
export function hasOverride(gameKey: string): boolean {
  return config[gameKey] != null
}

/** Set a game's RTP, clamped to the game's PER-GAME edge band (PART 2 — replaces the flat 5%
 *  clamp), and persist. The RTP is routed through the band in edge-bps space so high-edge games
 *  (keno, wheel) can be set richer and tight games (blackjack) can't exceed their ceiling. */
export function setRtp(gameKey: string, rtp: number): void {
  config[gameKey] = bpsToRtp(clampEdgeBps(gameKey, rtpToBps(rtp)))
  EDGE_DOC.save(config)
  notify()
}

/** One-time migration: re-clamp any persisted override into its game's per-game band. A stored
 *  value already inside the band is preserved exactly (existing edge values survive); one that
 *  predates the bands is pulled to the nearest band edge. Moves no money — config only. */
function migrateToBands(cfg: EdgeConfig): void {
  let changed = false
  for (const [key, rtp] of Object.entries(cfg)) {
    const reclamped = bpsToRtp(clampEdgeBps(key, rtpToBps(rtp)))
    if (reclamped !== rtp) {
      cfg[key] = reclamped
      changed = true
    }
  }
  if (changed) EDGE_DOC.save(cfg)
}

/** Drop a game's override, returning it to its native edge. */
export function resetRtp(gameKey: string): void {
  if (config[gameKey] == null) return
  delete config[gameKey]
  EDGE_DOC.save(config)
  notify()
}
