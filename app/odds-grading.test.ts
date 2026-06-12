import { describe, it, expect, beforeEach } from 'vitest'
import type { Account } from '../core/index.js'
import { createStore } from '../sportsbook/index.js'
import { resetOverlay } from '../sportsbook/book/overlay.js'
import { createIngestionPoller } from '../sportsdata/index.js'
import { makeProvider, MOCK_SLATE } from '../sportsdata/vendors/index.js'
import type { ApiEvent } from '../sportsdata/index.js'
import { clearLinesCache, ingestSlate, linesCacheFeed } from './lines-cache.js'

/**
 * Part 1c — results flow from the adapter, through the cache + cache feed, into the
 * existing `core` settlement path: a vendor reporting a final score settles a player's
 * open ticket and moves their figure, with no special grading code on the cache side.
 */
const noTimers = { setTimer: () => 0 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {} }

beforeEach(() => {
  clearLinesCache()
  resetOverlay()
})

describe('grading through the adapter into core', () => {
  it('a vendor final result settles an open ticket and moves the figure via core', async () => {
    const upcoming = MOCK_SLATE.find((e) => e.id === 'mock-nba-lal-bos')! // Lakers ML -135
    let slate: ApiEvent[] = [{ ...upcoming }]
    const provider = makeProvider({ name: 'spy', fetchOdds: async () => slate.map((e) => ({ ...e })) })
    const poller = createIngestionPoller({ provider, onSlate: ingestSlate, ...noTimers })

    await poller.refresh() // poll #1 → cache holds the upcoming game

    const account: Account = { id: 'p1', creditLimit: 100_000, balance: 0, pending: 0 }
    const store = createStore(account, { feed: linesCacheFeed() })

    // back the Lakers moneyline through the store (which holds the stake via core)
    const lakersML = store
      .getState()
      .events.find((e) => e.id === 'mock-nba-lal-bos')!
      .selections.find((s) => s.market === 'moneyline' && s.pick === 'home')!
    store.place([{ kind: 'single', legs: [lakersML], stake: 1_000 }])
    expect(account.pending).toBe(1_000)
    expect(account.balance).toBe(0)

    // the vendor now reports the game final with the Lakers winning
    slate = [
      {
        ...upcoming,
        status: 'final',
        completed: true,
        official: true,
        scores: [
          { name: 'Lakers', score: 110 },
          { name: 'Celtics', score: 100 },
        ],
      },
    ]
    await poller.refresh() // poll #2 → cache → feed → store auto-settles through core

    // stake released, figure up by the −135 profit (1000 × (1.7407−1) ≈ 740)
    expect(account.pending).toBe(0)
    expect(account.balance).toBeGreaterThan(0)
    expect(account.balance).toBe(741)

    store.destroy()
  })
})
