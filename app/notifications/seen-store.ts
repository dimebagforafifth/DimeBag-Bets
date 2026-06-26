/**
 * Per-player "last seen" marks for the in-app inbox — purely player-side read/unread
 * state (the operator messages store holds no read flags). Unread = messages newer than
 * the player's last-seen timestamp. Persisted under the shared 'dimebag' namespace.
 */

import { createLocalStore, persistedDoc } from '../../persistence/index.js'

interface SeenDoc {
  /** playerId → epoch ms last time they opened their inbox. */
  lastSeen: Record<string, number>
}

const kv = createLocalStore({ namespace: 'dimebag' })
const doc = persistedDoc<SeenDoc>(kv, 'player.msg-seen', { version: 1, initial: { lastSeen: {} } })

const state = doc.load()
const listeners = new Set<() => void>()
let version = 0

export function getLastSeen(playerId: string): number {
  return state.lastSeen[playerId] ?? 0
}

export function markSeen(playerId: string, now: number): void {
  if (state.lastSeen[playerId] === now) return
  state.lastSeen[playerId] = now
  doc.save(state)
  version += 1
  for (const l of listeners) l()
}

export function subscribeSeen(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSeenVersion(): number {
  return version
}
