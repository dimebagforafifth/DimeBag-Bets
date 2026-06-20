/**
 * Profile privacy — per-block visibility (public / followers-only / private).
 *
 * A player controls who sees each block of their profile. Visibility is resolved against the
 * follow graph: `followers` shows the block to anyone who follows the owner; `private` shows it
 * to no one but the owner. The owner always sees their own profile in full. This is a UI gate
 * over a read-only projection — it moves no money and changes no figure.
 *
 * // SEAM (Lane A / wiring): Lane A owns `profile_privacy`. The default source here is a local
 * persisted store so the controls work now; the wiring pass calls `setPrivacySource(laneA)` to
 * read privacy from Lane A's table (the write side can follow once Lane A exposes a writer).
 */

import { createStore, persistedDoc, type Doc } from '../persistence/index.js'
import { isFollowing } from './follow-graph.js'

export type Visibility = 'public' | 'followers' | 'private'

/** The blocks a profile is split into for privacy. */
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

/** A read source for privacy settings (what `canView` resolves against). */
export interface PrivacySource {
  visibilityFor(ownerId: string): BlockVisibility
}

/* -------------------------- local persisted store -------------------------- */

type PrivacyMap = Record<string, Partial<BlockVisibility>>

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<PrivacyMap> = persistedDoc<PrivacyMap>(store, 'profile.privacy', {
  version: 1,
  initial: {},
})

let settings: PrivacyMap = DOC.load()
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  DOC.save(settings)
  version += 1
  for (const l of listeners) l()
}

const localSource: PrivacySource = {
  visibilityFor(ownerId: string): BlockVisibility {
    return { ...DEFAULT_VISIBILITY, ...(settings[ownerId] ?? {}) }
  },
}

let source: PrivacySource = localSource

/** Repoint the read side (// SEAM: wiring → Lane A's profile_privacy). */
export function setPrivacySource(s: PrivacySource): void {
  source = s
}
/** Restore the local-store source (tests). */
export function resetPrivacySource(): void {
  source = localSource
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

/** The owner's per-block visibility (defaults to all-public). */
export function privacyOf(ownerId: string): BlockVisibility {
  return source.visibilityFor(ownerId)
}

/**
 * Whether `viewerId` may see `block` of `ownerId`'s profile.
 *  - the owner always sees their own profile in full;
 *  - `public` → anyone;
 *  - `followers` → viewers who follow the owner;
 *  - `private` → no one else.
 *
 * DESIGN: there is intentionally NO operator/agent bypass — privacy is universal, so a manager
 * sees a player's private blocks exactly as any other non-follower does. (// SEAM: if a vetted
 * support-override is ever needed, add it here behind an explicit, audited capability — never a
 * blanket role check.)
 */
export function canView(viewerId: string, ownerId: string, block: ProfileBlock): boolean {
  if (viewerId === ownerId) return true
  switch (privacyOf(ownerId)[block]) {
    case 'public':
      return true
    case 'followers':
      return isFollowing(viewerId, ownerId)
    case 'private':
      return false
  }
}

/** Whether the WHOLE profile is hidden from a viewer (every block blocked). */
export function isFullyHidden(viewerId: string, ownerId: string): boolean {
  if (viewerId === ownerId) return false
  return PROFILE_BLOCKS.every((b) => !canView(viewerId, ownerId, b.key))
}

/* ------------------------------- owner writes ------------------------------ */

/** Owner sets the visibility of one of their blocks (local store; not a money move). */
export function setBlockVisibility(
  ownerId: string,
  block: ProfileBlock,
  visibility: Visibility,
): void {
  const current = settings[ownerId] ?? {}
  settings = { ...settings, [ownerId]: { ...current, [block]: visibility } }
  notify()
}

/** Test reset — wipe local privacy + restore the default source. */
export function __resetPrivacy(): void {
  settings = {}
  source = localSource
  notify()
}
