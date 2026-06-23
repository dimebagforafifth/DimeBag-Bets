/**
 * The social graph — friends/follows. A directed edge: a player FOLLOWS another player in
 * their community, so their shared slips appear in the follower's feed (feed-store.ts).
 *
 * An external store (subscribe / version) like app/book/bets-store — now PERSISTED through the
 * shared KVStore seam so the graph survives a refresh. With no Supabase keys this is
 * localStorage only (off-by-default, byte-for-byte the prior behaviour in the browser; a
 * memory fallback in node/SSR/tests); with keys it rides the same Supabase cache as rewards/
 * book. `Map<string,Set>` isn't JSON-serialisable, so we persist a plain snapshot.
 */

import { createStore } from '../../persistence/index.js'
import { persistedDoc, type Doc } from '../../persistence/doc.js'

/** Serialisable snapshot of the graph: followerId → the ids they follow. */
type FollowsSnapshot = Record<string, string[]>

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<FollowsSnapshot> = persistedDoc<FollowsSnapshot>(store, 'social.follows', {
  version: 1,
  initial: {},
})

function toSnapshot(m: Map<string, Set<string>>): FollowsSnapshot {
  const out: FollowsSnapshot = {}
  for (const [k, set] of m) if (set.size) out[k] = [...set]
  return out
}
function fromSnapshot(s: FollowsSnapshot): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const [k, ids] of Object.entries(s)) m.set(k, new Set(ids))
  return m
}

/** followerId → set of the ids they follow. */
let following = fromSnapshot(DOC.load())
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  DOC.save(toSnapshot(following)) // persist before bumping version (mirrors rewards/economy)
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeFollows(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function followsVersion(): number {
  return version
}

/** Follow `target`. No self-follow, no duplicate. Idempotent. */
export function follow(followerId: string, targetId: string): void {
  if (!followerId || !targetId || followerId === targetId) return
  const set = following.get(followerId) ?? new Set<string>()
  if (set.has(targetId)) return
  set.add(targetId)
  following.set(followerId, set)
  notify()
}

/** Stop following `target`. Idempotent. */
export function unfollow(followerId: string, targetId: string): void {
  const set = following.get(followerId)
  if (!set || !set.has(targetId)) return
  set.delete(targetId)
  notify()
}

export function isFollowing(followerId: string, targetId: string): boolean {
  return following.get(followerId)?.has(targetId) ?? false
}

/** The ids `id` follows (a stable, sorted copy). */
export function followingOf(id: string): string[] {
  return [...(following.get(id) ?? [])].sort()
}

/** The ids that follow `id` (reverse scan). */
export function followersOf(id: string): string[] {
  const out: string[] = []
  for (const [follower, set] of following) {
    if (set.has(id)) out.push(follower)
  }
  return out.sort()
}

/** Following + follower counts for a player. */
export function followCounts(id: string): { following: number; followers: number } {
  return { following: followingOf(id).length, followers: followersOf(id).length }
}

/** Seed a batch of follow edges `[follower, target]` (the demo). */
export function seedFollows(edges: ReadonlyArray<readonly [string, string]>): void {
  for (const [a, b] of edges) {
    if (!a || !b || a === b) continue
    const set = following.get(a) ?? new Set<string>()
    set.add(b)
    following.set(a, set)
  }
  notify()
}

/** Wipe the graph (tests + a fresh demo). */
export function __resetFollows(): void {
  following = new Map()
  notify()
}
