/**
 * The follow graph — the unscoped 'all' edges ARE social's graph (single source); sport-scoped
 * edges extend it. Add/remove at both scopes, the unified view, and the any-scope follower test.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { __resetFollows } from '../social/follows-store.js'
import {
  addFollow,
  removeFollow,
  followingOf,
  followEdgesOf,
  scopedFollowing,
  isFollower,
  __resetFollowEdges,
} from './follow-graph.js'

const NOW = 1_750_000_000_000

beforeEach(() => {
  __resetFollows()
  __resetFollowEdges()
})

describe('all-scope follows delegate to social (no fork)', () => {
  it('add / remove route through the shared graph', () => {
    addFollow('a', 'b') // default scope 'all'
    expect(followingOf('a')).toEqual(['b'])
    expect(isFollower('a', 'b')).toBe(true)
    removeFollow('a', 'b')
    expect(followingOf('a')).toEqual([])
    expect(isFollower('a', 'b')).toBe(false)
  })

  it('no self-follow; idempotent', () => {
    addFollow('a', 'a')
    expect(followingOf('a')).toEqual([])
    addFollow('a', 'b')
    addFollow('a', 'b')
    expect(followingOf('a')).toEqual(['b'])
  })
})

describe('sport-scoped edges extend the graph', () => {
  it('a sport follow is tracked separately from the all graph but counts as a follower', () => {
    addFollow('a', 'c', { scope: 'sport', sportId: 'basketball', now: NOW })
    expect(followingOf('a')).toEqual([]) // not an all-scope edge
    expect(scopedFollowing('a', 'BASKETBALL')).toEqual(['c'])
    expect(isFollower('a', 'c')).toBe(true) // any scope

    const edges = followEdgesOf('a', NOW)
    expect(edges).toContainEqual({ followerId: 'a', followeeId: 'c', scope: 'sport', sportId: 'BASKETBALL', createdAt: NOW })

    removeFollow('a', 'c', { scope: 'sport', sportId: 'BASKETBALL' })
    expect(scopedFollowing('a', 'basketball')).toEqual([])
    expect(isFollower('a', 'c')).toBe(false)
  })

  it('followEdgesOf unions all-scope (social) + sport edges', () => {
    addFollow('a', 'b') // all
    addFollow('a', 'c', { scope: 'sport', sportId: 'NFL', now: NOW })
    const edges = followEdgesOf('a', NOW)
    expect(edges.map((e) => `${e.followeeId}:${e.scope}`).sort()).toEqual(['b:all', 'c:sport'])
  })
})
