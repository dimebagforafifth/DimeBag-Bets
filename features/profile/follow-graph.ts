/**
 * The follow graph — EXTENDS social's existing graph (social/follows-store); it never forks it.
 * Composed of TWO concerns (round 3, Feature 5):
 *
 *   1. Lane B — a swappable READ source (`FollowGraphSource`) the discovery/privacy surfaces read
 *      through. Default = social's graph; the wiring pass may repoint it via `setFollowGraphSource`.
 *      Plus `friendsOfFriends` (a pure graph read) for discovery.
 *   2. Lane A — the authoritative `follow_edge` schema: the unscoped ('all') graph IS social's
 *      `follow`/`followingOf` (the single source the feed + tail/fade already use), plus a
 *      SPORT-scoped follow dimension persisted alongside (never duplicating the 'all' edges).
 *      `isFollower` resolves "follows at ANY scope" — what 'followers'-only privacy gates on.
 *
 * Read-only over money (it touches none): a follow is a social edge, not a credit movement.
 * // SEAM (Lanes B & D): `followingOf` / `isFollower` are the single-source relations they consume.
 */

import { createStore } from '../../persistence/index.js'
import { persistedDoc, type Doc } from '../../persistence/doc.js'
import {
  follow as socialFollow,
  unfollow as socialUnfollow,
  isFollowing as socialIsFollowing,
  followingOf as socialFollowingOf,
  followersOf as socialFollowersOf,
  followCounts as socialFollowCounts,
  followsVersion as socialFollowsVersion,
  subscribeFollows as socialSubscribeFollows,
} from '../social/follows-store.js'

/* ===========================================================================
 * Lane B — the swappable read source (the seam the surfaces read through)
 * ======================================================================== */

/** The read side of a follow graph (what discovery/privacy need). */
export interface FollowGraphSource {
  followingOf(id: string): string[]
  followersOf(id: string): string[]
  isFollowing(followerId: string, targetId: string): boolean
}

const socialSource: FollowGraphSource = {
  followingOf: socialFollowingOf,
  followersOf: socialFollowersOf,
  isFollowing: socialIsFollowing,
}

let source: FollowGraphSource = socialSource

/** Repoint the read side of the graph (// SEAM: wiring → Lane A's authoritative graph). */
export function setFollowGraphSource(s: FollowGraphSource): void {
  source = s
}
/** Restore the default social-backed source (tests). */
export function resetFollowGraphSource(): void {
  source = socialSource
}

/** The ids `id` follows. */
export function followingOf(id: string): string[] {
  return source.followingOf(id)
}
/** The ids that follow `id`. */
export function followersOf(id: string): string[] {
  return source.followersOf(id)
}
/** Whether `followerId` follows `targetId` (unscoped). */
export function isFollowing(followerId: string, targetId: string): boolean {
  return source.isFollowing(followerId, targetId)
}

// Counts + the write side stay delegated to social (the canonical store) — a custom read source
// (Lane A) doesn't take over follow/unfollow, which still happen through social.
export function followCounts(id: string): { following: number; followers: number } {
  return socialFollowCounts(id)
}
/** Follow a player (delegates to social; idempotent, no self-follow). Not a money move. */
export function follow(followerId: string, targetId: string): void {
  socialFollow(followerId, targetId)
}
/** Unfollow a player (delegates to social). */
export function unfollow(followerId: string, targetId: string): void {
  socialUnfollow(followerId, targetId)
}

export const followsVersion = socialFollowsVersion
export const subscribeFollows = socialSubscribeFollows

/**
 * Friends-of-friends: ids followed by the people `viewerId` follows, minus the viewer and minus
 * anyone already followed. Ranked by MUTUAL count (how many of the viewer's follows also follow
 * the candidate) — the strongest social signal first. A pure graph read.
 */
export function friendsOfFriends(viewerId: string): { id: string; mutuals: number }[] {
  const directly = new Set(followingOf(viewerId))
  const score = new Map<string, number>()
  for (const friend of directly) {
    for (const candidate of followingOf(friend)) {
      if (candidate === viewerId || directly.has(candidate)) continue
      score.set(candidate, (score.get(candidate) ?? 0) + 1)
    }
  }
  return [...score.entries()]
    .map(([id, mutuals]) => ({ id, mutuals }))
    .sort((a, b) => b.mutuals - a.mutuals || a.id.localeCompare(b.id))
}

/* ===========================================================================
 * Lane A — sport-scoped edges (the 'all' ones live in social) + the
 * authoritative "follows at any scope" relation
 * ======================================================================== */

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

const sportKey = (f: string, t: string, s?: string): string =>
  `${f}>${t}:${(s ?? '').toUpperCase()}`

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
    socialFollow(followerId, followeeId)
    return
  }
  const key = sportKey(followerId, followeeId, opts.sportId)
  if (scoped.some((e) => sportKey(e.followerId, e.followeeId, e.sportId) === key)) return
  scoped = [
    ...scoped,
    {
      followerId,
      followeeId,
      scope: 'sport',
      sportId: (opts.sportId ?? '').toUpperCase(),
      createdAt: opts.now ?? Date.now(),
    },
  ]
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
    socialUnfollow(followerId, followeeId)
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
  const all: FollowEdge[] = socialFollowingOf(followerId).map((followeeId) => ({
    followerId,
    followeeId,
    scope: 'all',
    createdAt: now,
  }))
  const sport = scoped.filter((e) => e.followerId === followerId)
  return [...all, ...sport]
}

/** Followees a viewer follows specifically in a sport (sport-scoped edges only). */
export function scopedFollowing(followerId: string, sportId: string): string[] {
  const sid = sportId.toUpperCase()
  return scoped
    .filter((e) => e.followerId === followerId && e.sportId === sid)
    .map((e) => e.followeeId)
    .sort()
}

/**
 * Whether `viewerId` follows `targetId` at ANY scope — the relation 'followers' privacy resolves
 * against. Combines social's authoritative 'all' graph with the sport-scoped edges. (Uses the
 * social graph directly — the single source — not the swappable read source.)
 */
export function isFollower(viewerId: string, targetId: string): boolean {
  if (socialIsFollowing(viewerId, targetId)) return true
  return scoped.some((e) => e.followerId === viewerId && e.followeeId === targetId)
}

/** All sport-scoped edges (the 'all' ones live in social). */
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
