/**
 * profile_privacy — per-player, per-block visibility for the read-only profile projection.
 *
 * A player can scope each block of their profile (e.g. 'stats', 'bets', 'streaks') to 'public',
 * 'followers', or 'private'. `canView` resolves whether a viewer may see a block, using the
 * follow graph (follow-graph.isFollower) for the 'followers' case. This gates READS only — it
 * never touches money or the projection's values (a hidden block is simply not returned).
 *
 * Persisted on the standard tenant-scoped doc seam; a block with no row defaults to 'public'.
 */

import { createStore } from '../persistence/index.js'
import { persistedDoc, type Doc } from '../persistence/doc.js'
import { isFollower } from './follow-graph.js'

export type Visibility = 'public' | 'followers' | 'private'

/** A profile block a player can scope independently. Free-form (the UI names the blocks). */
export type BlockKey = string

type PrivacySnapshot = Record<string, Visibility> // `${playerId}:${blockKey}` → visibility

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<PrivacySnapshot> = persistedDoc<PrivacySnapshot>(store, 'social.profilePrivacy', {
  version: 1,
  initial: {},
})

let privacy: PrivacySnapshot = DOC.load() ?? {}
let version = 0
const listeners = new Set<() => void>()
function notify(): void {
  DOC.save(privacy)
  version += 1
  for (const l of listeners) l()
}

const key = (playerId: string, blockKey: BlockKey): string => `${playerId}:${blockKey}`

/** The visibility a player set for a block (default 'public'). */
export function getVisibility(playerId: string, blockKey: BlockKey): Visibility {
  return privacy[key(playerId, blockKey)] ?? 'public'
}

/** Set a block's visibility (the player's own privacy control). */
export function setVisibility(playerId: string, blockKey: BlockKey, visibility: Visibility): void {
  privacy = { ...privacy, [key(playerId, blockKey)]: visibility }
  notify()
}

/**
 * Whether `viewerId` may see `targetId`'s `blockKey`. A player always sees their own profile.
 * Otherwise: 'public' → yes; 'followers' → only if the viewer follows the target (any scope);
 * 'private' → no one but the owner. An anonymous viewer (no id) sees only public blocks.
 */
export function canView(viewerId: string | null | undefined, targetId: string, blockKey: BlockKey): boolean {
  if (viewerId && viewerId === targetId) return true
  switch (getVisibility(targetId, blockKey)) {
    case 'public':
      return true
    case 'followers':
      return !!viewerId && isFollower(viewerId, targetId)
    case 'private':
      return false
  }
}

/** All privacy rows for a player (for their settings UI). */
export function visibilityFor(playerId: string): Record<BlockKey, Visibility> {
  const out: Record<BlockKey, Visibility> = {}
  const prefix = `${playerId}:`
  for (const [k, v] of Object.entries(privacy)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v
  }
  return out
}

export function subscribePrivacy(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function privacyVersion(): number {
  return version
}

export function __resetPrivacy(): void {
  privacy = {}
  notify()
}
