/**
 * Follow-graph adapter — the social graph the discovery + privacy surfaces read through.
 *
 * Today this delegates to the EXISTING social follow graph (social/follows-store) — the brief's
 * "extend, don't fork" substrate. Follows are NOT credits, so following/unfollowing is a normal
 * social write (it moves no money); reads are pure.
 *
 * // SEAM (Lane A / wiring): Lane A exposes the authoritative `followingOf(viewerId)` over its
 * own graph. This module is the single seam the surfaces import, so the wiring pass repoints the
 * read side with `setFollowGraphSource(laneA)` and nothing downstream changes.
 */

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
/** Whether `followerId` follows `targetId`. */
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
