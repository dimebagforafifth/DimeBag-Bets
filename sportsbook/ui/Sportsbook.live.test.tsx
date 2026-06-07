// @vitest-environment happy-dom
/**
 * The board renders through the shared live primitives (one source of truth):
 * the feed-status chip, the LIVE badge + score on an in-play game, the kickoff
 * label on an upcoming one, and the price-move tick on a live price. Proves the
 * inline reimplementations were replaced by ./live and behavior is preserved —
 * still on the mock-feed data shapes (no real odds API).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Account } from '../../core/index.js'
import type { SportsbookFeed } from '../provider.js'
import { EVENTS, createStore, resetFutures, resetOverlay } from '../index.js'
import { Sportsbook } from './Sportsbook.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function account(): Account {
  return { id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0 }
}

/** A feed whose slate has one in-play game (the rest upcoming) — the exact shape
 *  the mock feed emits once a game kicks off. Static, so the render is deterministic. */
function liveSlateFeed(): SportsbookFeed {
  const slate = EVENTS.map((e) =>
    e.id === 'nba-lal-bos'
      ? { ...e, status: 'live' as const, clock: 'Q3', score: { home: 70, away: 64 }, progress: 0.6 }
      : { ...e, status: 'upcoming' as const },
  )
  return { snapshot: () => slate, subscribe: () => () => {}, start() {}, stop() {} }
}

beforeEach(() => {
  resetFutures()
  resetOverlay()
})
afterEach(() => {
  resetFutures()
  resetOverlay()
})

describe('Sportsbook — wired to the live primitives', () => {
  it('renders the feed chip, the LIVE badge/score, and a price tick through ./live', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const acct = account()
    const store = createStore(acct, { feed: liveSlateFeed() })
    act(() => root.render(<Sportsbook account={acct} store={store} />))

    // the feed-status chip is the shared <FeedStatus> (the old inline .sb-feed pill is gone)
    expect(host.querySelector('.feed-status')).not.toBeNull()
    expect(host.querySelector('.sb-feed')).toBeNull()

    // the in-play game shows the shared LIVE badge + score
    const liveBadge = host.querySelector('.live-badge.is-live')
    expect(liveBadge).not.toBeNull()
    expect(liveBadge?.textContent).toMatch(/LIVE/)
    expect(host.querySelector('.live-score')?.textContent).toBe('64–70') // away–home

    // its live price renders through <OddsTick> (the old inline .sb-move-arrow is gone)
    expect(host.querySelector('.odds-tick')).not.toBeNull()

    // an upcoming game shows its kickoff label through <LiveBadge> (replacing inline .sb-time)
    expect(host.querySelector('.live-badge.is-upcoming')).not.toBeNull()

    act(() => root.unmount())
    host.remove()
    store.destroy()
  })
})
