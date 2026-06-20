/**
 * Privacy gating — per-block visibility resolved against the follow graph. The owner always sees
 * their own profile; `public` is visible to anyone; `followers` only to followers; `private` to
 * no one else. A fully-private profile is hidden from a non-follower. No money here.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { __resetFollows } from '../social/follows-store.js'
import { follow, resetFollowGraphSource } from './follow-graph.js'
import {
  __resetPrivacy,
  canView,
  isFullyHidden,
  PROFILE_BLOCKS,
  resetPrivacySource,
  setBlockVisibility,
} from './privacy.js'

const OWNER = 'owner'
const FOLLOWER = 'fol'
const STRANGER = 'str'

beforeEach(() => {
  __resetFollows()
  __resetPrivacy()
  resetFollowGraphSource()
  resetPrivacySource()
  follow(FOLLOWER, OWNER) // the follower follows the owner
})
afterEach(() => {
  __resetFollows()
  __resetPrivacy()
})

describe('canView', () => {
  it('shows public blocks to anyone', () => {
    expect(canView(STRANGER, OWNER, 'stats')).toBe(true)
    expect(canView(FOLLOWER, OWNER, 'stats')).toBe(true)
  })

  it('shows followers-only blocks to followers and the owner, not strangers', () => {
    setBlockVisibility(OWNER, 'stats', 'followers')
    expect(canView(OWNER, OWNER, 'stats')).toBe(true) // owner always
    expect(canView(FOLLOWER, OWNER, 'stats')).toBe(true)
    expect(canView(STRANGER, OWNER, 'stats')).toBe(false)
  })

  it('hides private blocks from everyone but the owner', () => {
    setBlockVisibility(OWNER, 'performance', 'private')
    expect(canView(OWNER, OWNER, 'performance')).toBe(true)
    expect(canView(FOLLOWER, OWNER, 'performance')).toBe(false)
    expect(canView(STRANGER, OWNER, 'performance')).toBe(false)
  })
})

describe('isFullyHidden', () => {
  it('is true for a non-follower when every block is private, false for the owner', () => {
    for (const b of PROFILE_BLOCKS) setBlockVisibility(OWNER, b.key, 'private')
    expect(isFullyHidden(STRANGER, OWNER)).toBe(true)
    expect(isFullyHidden(FOLLOWER, OWNER)).toBe(true) // private excludes followers too
    expect(isFullyHidden(OWNER, OWNER)).toBe(false)
  })

  it('is false when at least one block stays public', () => {
    for (const b of PROFILE_BLOCKS) setBlockVisibility(OWNER, b.key, 'private')
    setBlockVisibility(OWNER, 'badges', 'public')
    expect(isFullyHidden(STRANGER, OWNER)).toBe(false)
  })
})
