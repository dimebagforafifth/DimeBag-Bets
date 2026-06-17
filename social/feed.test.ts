/** The feed: sharing, the privacy toggle (owner-only), reactions, comments, and the
 *  follow-scoped feed query (public from followed + own; private of others never shows). */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  shareSlip,
  setVisibility,
  toggleReaction,
  reactionCounts,
  addComment,
  feedFor,
  getSlip,
  __resetFeed,
} from './feed-store.js'
import type { ShareSlipInput } from './feed-store.js'

const base: Omit<ShareSlipInput, 'playerId' | 'playerName'> = {
  legs: [],
  mode: 'single',
  stakeCents: 1_000,
  decimal: 1.9,
  sharedAt: 1000,
}
const share = (playerId: string, over: Partial<ShareSlipInput> = {}) =>
  shareSlip({ ...base, playerId, playerName: playerId, ...over })

beforeEach(() => __resetFeed())

describe('feed-store', () => {
  it('shares a slip public by default, newest first', () => {
    const a = share('p-lena')
    const b = share('p-marco')
    expect(a.visibility).toBe('public')
    expect(feedFor('p-x', ['p-lena', 'p-marco']).map((s) => s.id)).toEqual([b.id, a.id])
  })

  it('share toggles privacy — only the owner, and a private slip leaves followers’ feeds', () => {
    const slip = share('p-lena')
    // a non-owner cannot flip privacy
    expect(() => setVisibility(slip.id, 'p-marco', 'private')).toThrow(/owner/)
    expect(feedFor('p-marco', ['p-lena'])).toHaveLength(1)

    setVisibility(slip.id, 'p-lena', 'private') // owner makes it private
    expect(getSlip(slip.id)!.visibility).toBe('private')
    expect(feedFor('p-marco', ['p-lena'])).toHaveLength(0) // gone from a follower's feed
    expect(feedFor('p-lena', [])).toHaveLength(1) // still visible to the owner
  })

  it('feed = public from followed players + own (private of others hidden)', () => {
    share('p-lena') // followed → shows
    share('p-dana') // not followed → hidden
    share('p-marco', { visibility: 'private' }) // own private → still shows to self
    const feed = feedFor('p-marco', ['p-lena'])
    expect(feed.map((s) => s.playerId).sort()).toEqual(['p-lena', 'p-marco'])
  })

  it('toggles reactions and counts them', () => {
    const slip = share('p-lena')
    toggleReaction(slip.id, 'p-marco', '🔥')
    toggleReaction(slip.id, 'p-dana', '🔥')
    toggleReaction(slip.id, 'p-marco', '💰')
    expect(reactionCounts(getSlip(slip.id)!)).toEqual({ '🔥': 2, '💰': 1 })
    toggleReaction(slip.id, 'p-marco', '🔥') // remove
    expect(reactionCounts(getSlip(slip.id)!)).toEqual({ '🔥': 1, '💰': 1 })
  })

  it('adds comments, ignoring empty text', () => {
    const slip = share('p-lena')
    expect(addComment(slip.id, 'p-marco', 'Marco', '  ', 1)).toBeNull()
    const c = addComment(slip.id, 'p-marco', 'Marco', '  lock 🔒 ', 2)
    expect(c?.text).toBe('lock 🔒')
    expect(getSlip(slip.id)!.comments).toHaveLength(1)
  })
})
