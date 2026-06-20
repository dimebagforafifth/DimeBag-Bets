/**
 * The follow graph — EXTENDS social's existing graph (social/follows-store), it does not fork
 * it. The unscoped ('all') graph IS social's `follow`/`followingOf` (the single source of truth
 * the feed + tail/fade already use, re-exported here as the // SEAM Lanes B & D consume). This
 * module adds the `scope` dimension from the round's `follow_edge` schema: a SPORT-scoped follow
 * (tail a player only in one sport), persisted alongside but never duplicating the 'all' edges.
 *
 * Read-only over money (it touches none): a follow is a social edge, not a credit movement.
 */

import { createStore } from '../persistence/index.js'
import { persistedDoc, type Doc } from '../persistence/doc.js'
import {
  follow as followAll,
  unfollow as unfollowAll,
  isFollowing as isFollowingAll,
  followingOf,
} from '../social/follows-store.js'

// Re-export social's unscoped graph as THE follow SEAM (single source — no fork).
export { follow, unfollow, isFollowing, followingOf, followersOf, followCounts, subscribeFollows, followsVersion } from '../social/follows-store.js'

export type FollowScope = 'all' | 'sport'

/** One follow edge — mirrors the follow_edge schema (follower, followee, scope, sport, when). */
export interface FollowEdge {
  followerId: string
  followeeId: string
  scope: FollowScope
  /** Set only for scope 'sport' (the SGO sportID, upper-cased). */
  sportId?: string
  createdAt: number
}

/* --------------------- sport-scoped edges (the 'all' ones live in social) -- */

type ScopedSnapshot = FollowEdge[]
const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<ScopedSnapshot> = persistedDoc<ScopedSnapshot>(store, 'social.followEdges', {
  version: 1,
  initial: [],
})

let scoped: FollowEdge[] = (DOC.load() ?? []).filter((e) => e.scope === 'sport')
let version = 0
const listeners = new Set<() => void>()
function notify(): void {
  DOC.save(scoped)
  version += 1
  for (const l of listeners) l()
}

const sportKey = (f: string, t: string, s?: string): string => `${f}>${t}:${(s ?? '').toUpperCase()}`

/**
 * Add a follow edge. scope 'all' delegates to social (the shared graph); scope 'sport' records
 * a sport-scoped edge here. Idempotent, no self-follow.
 */
export function addFollow(
  followerId: string,
  followeeId: string,
  opts: { scope?: FollowScope; sportId?: string; now?: number } = {},
): void {
  if (!followerId || !followeeId || followerId === followeeId) return
  const scope = opts.scope ?? 'all'
  if (scope === 'all') {
    followAll(followerId, followeeId)
    return
  }
  const key = sportKey(followerId, followeeId, opts.sportId)
  if (scoped.some((e) => sportKey(e.followerId, e.followeeId, e.sportId) === key)) return
  scoped = [...scoped, { followerId, followeeId, scope: 'sport', sportId: (opts.sportId ?? '').toUpperCase(), createdAt: opts.now ?? Date.now() }]
  notify()
}

/** Remove a follow edge (mirrors addFollow's routing). Idempotent. */
export function removeFollow(
  followerId: string,
  followeeId: string,
  opts: { scope?: FollowScope; sportId?: string } = {},
): void {
  const scope = opts.scope ?? 'all'
  if (scope === 'all') {
    unfollowAll(followerId, followeeId)
    return
  }
  const key = sportKey(followerId, followeeId, opts.sportId)
  const next = scoped.filter((e) => sportKey(e.followerId, e.followeeId, e.sportId) !== key)
  if (next.length !== scoped.length) {
    scoped = next
    notify()
  }
}

/** Every follow edge a viewer has — the 'all' edges (from social) + their sport-scoped edges. */
export function followEdgesOf(followerId: string, now = Date.now()): FollowEdge[] {
  const all: FollowEdge[] = followingOf(followerId).map((followeeId) => ({ followerId, followeeId, scope: 'all', createdAt: now }))
  const sport = scoped.filter((e) => e.followerId === followerId)
  return [...all, ...sport]
}

/** Followees a viewer follows specifically in a sport (sport-scoped edges only). */
export function scopedFollowing(followerId: string, sportId: string): string[] {
  const sid = sportId.toUpperCase()
  return scoped.filter((e) => e.followerId === followerId && e.sportId === sid).map((e) => e.followeeId).sort()
}

/**
 * Whether `viewerId` follows `targetId` at ANY scope — the relation privacy 'followers'
 * visibility resolves against. Combines social's 'all' graph with the sport-scoped edges.
 */
export function isFollower(viewerId: string, targetId: string): boolean {
  if (isFollowingAll(viewerId, targetId)) return true
  return scoped.some((e) => e.followerId === viewerId && e.followeeId === targetId)
}

/** Both reverse + forward unscoped counts plus scoped edge count (for a profile header). */
export function scopedEdges(): FollowEdge[] {
  return scoped
}

export function subscribeFollowEdges(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function followEdgesVersion(): number {
  return version
}

export function __resetFollowEdges(): void {
  scoped = []
  notify()
}
