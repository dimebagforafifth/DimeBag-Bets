/** The social graph: follow/unfollow, follower/following lists, no self-follow. */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  follow,
  unfollow,
  isFollowing,
  followingOf,
  followersOf,
  followCounts,
  seedFollows,
  __resetFollows,
} from './follows-store.js'

beforeEach(() => __resetFollows())

describe('follows-store', () => {
  it('follows and unfollows a player', () => {
    follow('p-marco', 'p-lena')
    expect(isFollowing('p-marco', 'p-lena')).toBe(true)
    expect(followingOf('p-marco')).toEqual(['p-lena'])
    expect(followersOf('p-lena')).toEqual(['p-marco'])

    unfollow('p-marco', 'p-lena')
    expect(isFollowing('p-marco', 'p-lena')).toBe(false)
    expect(followingOf('p-marco')).toEqual([])
    expect(followersOf('p-lena')).toEqual([])
  })

  it('ignores self-follow and de-dupes', () => {
    follow('p-marco', 'p-marco') // no self-follow
    follow('p-marco', 'p-lena')
    follow('p-marco', 'p-lena') // idempotent
    expect(followingOf('p-marco')).toEqual(['p-lena'])
  })

  it('tracks follower/following counts both directions', () => {
    seedFollows([
      ['p-marco', 'p-lena'],
      ['p-priya', 'p-lena'],
      ['p-lena', 'p-marco'],
    ])
    expect(followCounts('p-lena')).toEqual({ following: 1, followers: 2 })
    expect(followCounts('p-marco')).toEqual({ following: 1, followers: 1 })
    expect(followersOf('p-lena')).toEqual(['p-marco', 'p-priya'])
  })
})
