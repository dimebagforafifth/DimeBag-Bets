/**
 * profile_privacy — per-player, per-block visibility for the read-only profile projection.
 * Composed of TWO concerns (round 3, Feature 5):
 *
 *   1. Lane A — the AUTHORITATIVE store: a player scopes each block (free-form `BlockKey`) to
 *      'public' | 'followers' | 'private'; `canView` resolves a read using the follow graph
 *      (`isFollower`, any scope) for the 'followers' case. Persisted on the tenant-scoped doc seam.
 *   2. Lane B — the UI's fixed block set (`ProfileBlock`) + a swappable read source
 *      (`PrivacySource`) the surfaces read through. The source DEFAULTS to the authoritative store
 *      (so reads and the gate agree); the wiring pass may repoint it via `setPrivacySource`.
 *      `setBlockVisibility` writes through to the authoritative store — a single source of truth.
 *
 * This gates READS only — it never touches money or the projection's values (a hidden block is
 * simply not returned). There is intentionally NO operator/agent bypass: privacy is universal.
 */

import { createStore } from '../../persistence/index.js'
import { persistedDoc, type Doc } from '../../persistence/doc.js'
import { isFollower } from './follow-graph.js'

export type Visibility = 'public' | 'followers' | 'private'

/** A profile block a player can scope independently. Free-form (the UI names the blocks). */
export type BlockKey = string

/* ===========================================================================
 * Lane B — the fixed UI block set (a subset of the free-form BlockKey space)
 * ======================================================================== */

export type ProfileBlock = 'stats' | 'performance' | 'splits' | 'badges'

export const PROFILE_BLOCKS: { key: ProfileBlock; label: string; hint: string }[] = [
  { key: 'stats', label: 'Headline stats', hint: 'W/L, ROI, units, net' },
  { key: 'performance', label: 'Performance graph', hint: 'Cumulative P&L over time' },
  { key: 'splits', label: 'By sport / market / game', hint: 'Where you win and lose' },
  { key: 'badges', label: 'Badges & streaks', hint: 'Earned highlights' },
]

export type BlockVisibility = Record<ProfileBlock, Visibility>

const DEFAULT_VISIBILITY: BlockVisibility = {
  stats: 'public',
  performance: 'public',
  splits: 'public',
  badges: 'public',
}

/* ===========================================================================
 * Lane A — the authoritative per-(player, blockKey) store
 * ======================================================================== */

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

/** All privacy rows for a player (for their settings UI) — only the blocks they've set. */
export function visibilityFor(playerId: string): Record<BlockKey, Visibility> {
  const out: Record<BlockKey, Visibility> = {}
  const prefix = `${playerId}:`
  for (const [k, v] of Object.entries(privacy)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v
  }
  return out
}

/* ===========================================================================
 * Lane B — the swappable read source (default reads the authoritative store)
 * ======================================================================== */

/** A read source for privacy settings (what the settings UI / discovery resolve against). */
export interface PrivacySource {
  visibilityFor(ownerId: string): BlockVisibility
}

// The default source reads the authoritative store, so the settings display and `canView` agree.
const storeBackedSource: PrivacySource = {
  visibilityFor(ownerId: string): BlockVisibility {
    const out = { ...DEFAULT_VISIBILITY }
    for (const b of PROFILE_BLOCKS) out[b.key] = getVisibility(ownerId, b.key)
    return out
  },
}

let source: PrivacySource = storeBackedSource

/** Repoint the read side (// SEAM: wiring → Lane A's profile_privacy; default already reads it). */
export function setPrivacySource(s: PrivacySource): void {
  source = s
}
/** Restore the store-backed source (tests). */
export function resetPrivacySource(): void {
  source = storeBackedSource
}

/** The owner's per-block visibility map (the four UI blocks; defaults to all-public). */
export function privacyOf(ownerId: string): BlockVisibility {
  return source.visibilityFor(ownerId)
}

/* ===========================================================================
 * Resolution + owner writes (one source of truth)
 * ======================================================================== */

/**
 * Whether `viewerId` may see `targetId`'s `blockKey`. A player always sees their own profile.
 * Otherwise: 'public' → yes; 'followers' → only if the viewer follows the target (ANY scope);
 * 'private' → no one but the owner. An anonymous viewer (no id) sees only public blocks.
 */
export function canView(
  viewerId: string | null | undefined,
  targetId: string,
  blockKey: BlockKey,
): boolean {
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

/** Whether the WHOLE profile is hidden from a viewer (every UI block blocked). */
export function isFullyHidden(viewerId: string, ownerId: string): boolean {
  if (viewerId === ownerId) return false
  return PROFILE_BLOCKS.every((b) => !canView(viewerId, ownerId, b.key))
}

/** Owner sets the visibility of one of their UI blocks (writes the authoritative store). */
export function setBlockVisibility(
  ownerId: string,
  block: ProfileBlock,
  visibility: Visibility,
): void {
  setVisibility(ownerId, block, visibility)
}

export function subscribePrivacy(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function privacyVersion(): number {
  return version
}

/** Test reset — wipe privacy + restore the default source. */
export function __resetPrivacy(): void {
  privacy = {}
  source = storeBackedSource
  notify()
}
