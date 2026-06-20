/**
 * profile_privacy — per-block visibility resolution (the merged Lane A store + Lane B UI seam).
 * A followers-only block is hidden from a non-follower, shown to a follower (any scope) + the
 * owner; a private block is owner-only. `setBlockVisibility` writes the authoritative store. No
 * money here.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { __resetFollows } from '../social/follows-store.js'
import { addFollow, follow, resetFollowGraphSource, __resetFollowEdges } from './follow-graph.js'
import {
  canView,
  getVisibility,
  setVisibility,
  visibilityFor,
  isFullyHidden,
  PROFILE_BLOCKS,
  resetPrivacySource,
  setBlockVisibility,
  __resetPrivacy,
} from './privacy.js'

beforeEach(() => {
  __resetPrivacy()
  __resetFollows()
  __resetFollowEdges()
  resetFollowGraphSource()
  resetPrivacySource()
})

describe('canView — authoritative store (free-form blocks, null viewer, scoped followers)', () => {
  it('blocks default to public — visible to anyone, even anonymous', () => {
    expect(getVisibility('t', 'stats')).toBe('public')
    expect(canView('v', 't', 'stats')).toBe(true)
    expect(canView(null, 't', 'stats')).toBe(true)
  })

  it('followers-only: hidden from a non-follower, shown to a follower + the owner', () => {
    setVisibility('t', 'stats', 'followers')
    expect(canView('v', 't', 'stats')).toBe(false) // v doesn't follow t
    expect(canView(null, 't', 'stats')).toBe(false) // anonymous
    addFollow('v', 't') // v now follows t
    expect(canView('v', 't', 'stats')).toBe(true)
    expect(canView('t', 't', 'stats')).toBe(true) // owner always
  })

  it('a sport-scoped follower also satisfies followers-only', () => {
    setVisibility('t', 'stats', 'followers')
    addFollow('v', 't', { scope: 'sport', sportId: 'NBA' })
    expect(canView('v', 't', 'stats')).toBe(true)
  })

  it('private: owner-only, even followers are blocked', () => {
    setVisibility('t', 'bets', 'private')
    addFollow('v', 't')
    expect(canView('v', 't', 'bets')).toBe(false)
    expect(canView('t', 't', 'bets')).toBe(true)
  })

  it('visibilityFor lists a player’s own rows', () => {
    setVisibility('t', 'stats', 'followers')
    setVisibility('t', 'bets', 'private')
    expect(visibilityFor('t')).toEqual({ stats: 'followers', bets: 'private' })
  })
})

describe('canView — UI blocks (Lane B surfaces)', () => {
  const OWNER = 'owner'
  const FOLLOWER = 'fol'
  const STRANGER = 'str'

  beforeEach(() => {
    follow(FOLLOWER, OWNER) // the follower follows the owner
  })

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
  const OWNER = 'owner'
  const FOLLOWER = 'fol'
  const STRANGER = 'str'

  beforeEach(() => {
    follow(FOLLOWER, OWNER)
  })

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
