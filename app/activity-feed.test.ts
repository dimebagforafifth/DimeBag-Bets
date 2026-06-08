/**
 * The live activity feed shaping logic: resolved-bet events become newest-first
 * ticker items, with player names resolved and big wins flagged. Pure — no
 * singletons, no timers.
 */

import { describe, it, expect } from 'vitest'
import type { FeedEntry } from './ledger-store.js'
import { toTickerItems, isBigWin } from './activity-feed.js'

function entry(over: Partial<FeedEntry>): FeedEntry {
  return {
    id: 1,
    game: 'Mines',
    gameKey: 'mines',
    accountId: 'p1',
    stake: 1000,
    multiplier: 0,
    profit: -1000,
    outcome: 'loss',
    time: 1000,
    ...over,
  }
}

const names = new Map([
  ['p1', 'Ada'],
  ['p2', 'Bo'],
])

describe('isBigWin', () => {
  it('flags a high-profit OR high-multiplier win, never a loss/push', () => {
    expect(isBigWin({ outcome: 'win', profit: 6000, multiplier: 2 })).toBe(true) // big by profit
    expect(isBigWin({ outcome: 'win', profit: 200, multiplier: 12 })).toBe(true) // big by multiplier
    expect(isBigWin({ outcome: 'win', profit: 200, multiplier: 2 })).toBe(false) // small win
    expect(isBigWin({ outcome: 'loss', profit: -1000, multiplier: 0 })).toBe(false)
    expect(isBigWin({ outcome: 'push', profit: 0, multiplier: 1 })).toBe(false)
  })
  it('honours custom thresholds', () => {
    expect(isBigWin({ outcome: 'win', profit: 500, multiplier: 2 }, { bigWinCents: 400 })).toBe(true)
    expect(isBigWin({ outcome: 'win', profit: 100, multiplier: 4 }, { bigMultiplier: 3 })).toBe(true)
  })
})

describe('toTickerItems', () => {
  it('maps resolved events to items, resolves names, flags big wins, newest first', () => {
    const feed: FeedEntry[] = [
      entry({ id: 3, accountId: 'p2', outcome: 'win', profit: 9000, multiplier: 10, stake: 1000, game: 'Crash', gameKey: 'crash', time: 3000 }),
      entry({ id: 2, accountId: 'p1', outcome: 'win', profit: 500, multiplier: 1.5, stake: 1000, time: 2000 }),
      entry({ id: 1, accountId: 'p9', outcome: 'loss', profit: -1000, multiplier: 0, stake: 1000, time: 1000 }),
    ]
    const items = toTickerItems(feed, names)
    expect(items.map((i) => i.id)).toEqual([3, 2, 1]) // preserves newest-first order

    expect(items[0]).toMatchObject({ player: 'Bo', game: 'Crash', outcome: 'win', profit: 9000, big: true })
    expect(items[1]).toMatchObject({ player: 'Ada', outcome: 'win', big: false }) // small win
    expect(items[2]).toMatchObject({ player: 'A player', outcome: 'loss', big: false }) // unknown id → fallback
  })

  it('respects the limit', () => {
    const feed = Array.from({ length: 30 }, (_, i) => entry({ id: i + 1, time: i }))
    expect(toTickerItems(feed, names, { limit: 5 })).toHaveLength(5)
    expect(toTickerItems(feed, names, { limit: 5 })[0].id).toBe(1) // first five of the newest-first feed
  })

  it('handles an empty feed', () => {
    expect(toTickerItems([], names)).toEqual([])
  })
})
