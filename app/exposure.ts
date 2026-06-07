/**
 * Live exposure by game (CLAUDE.md §4) — the book's at-risk OPEN stake, broken down by
 * the product each bet was placed on. The durable ledger records RESOLVED bets; this
 * tracks the bets still in flight. It rides core's place/resolve events (added with the
 * Phase-2 per-game attribution work): on `onWagerPlaced` it adds the stake to the game
 * that's on screen, on `onWagerResolved` it removes it from the game the bet was PLACED
 * on (so an async sportsbook grade decrements the right game, not whatever's active).
 *
 * In-memory + live (open holds are session state — book-store clears pending on reload),
 * so this starts empty each load and accumulates as bets are placed. Same subscribe +
 * version-snapshot shape as the other stores. Holds no money.
 */

import { onWagerPlaced, onWagerResolved, type PlaceEvent, type ResolveEvent } from '../core/index.js'
import { getActiveGame } from './ledger-store.js'

export interface ExposureByGame {
  key: string
  name: string
  /** Open (ungraded) stake on this game, in cents. */
  open: number
}

interface Held {
  game: { key: string; name: string }
  stake: number
}

const held = new Map<string, Held>() // wagerId → its open stake + the game it was placed on
const byGame = new Map<string, ExposureByGame>()
const listeners = new Set<() => void>()
let version = 0
let snapshot: ExposureByGame[] = []

function rebuild(): void {
  snapshot = [...byGame.values()].filter((g) => g.open > 0).sort((a, b) => b.open - a.open)
  version += 1
  listeners.forEach((l) => l())
}

onWagerPlaced((e: PlaceEvent) => {
  const game = getActiveGame()
  held.set(e.wagerId, { game, stake: e.stake })
  const g = byGame.get(game.key) ?? { key: game.key, name: game.name, open: 0 }
  g.open += e.stake
  byGame.set(game.key, g)
  rebuild()
})

onWagerResolved((e: ResolveEvent) => {
  const rec = held.get(e.wagerId)
  if (!rec) return // a bet placed before this tracker existed — nothing to decrement
  held.delete(e.wagerId)
  const g = byGame.get(rec.game.key)
  if (g) g.open = Math.max(0, g.open - rec.stake)
  rebuild()
})

/** Open exposure per game, biggest first (stable reference between changes). */
export function getExposureByGame(): ExposureByGame[] {
  return snapshot
}

export function subscribeExposure(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getExposureVersion(): number {
  return version
}

/** Total open stake across every game (cents). */
export function totalOpenExposure(): number {
  let total = 0
  for (const g of byGame.values()) total += g.open
  return total
}
