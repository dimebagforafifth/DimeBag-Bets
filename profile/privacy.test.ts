/**
 * profile_privacy — per-block visibility resolution. A followers-only block is hidden from a
 * non-follower, shown to a follower + the owner; a private block is owner-only.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { __resetFollows } from '../social/follows-store.js'
import { addFollow, __resetFollowEdges } from './follow-graph.js'
import { canView, getVisibility, setVisibility, visibilityFor, __resetPrivacy } from './privacy.js'

beforeEach(() => {
  __resetPrivacy()
  __resetFollows()
  __resetFollowEdges()
})

describe('canView', () => {
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
