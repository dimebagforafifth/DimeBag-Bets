// @vitest-environment happy-dom
/**
 * The ActivityTicker renders recent activity from real resolved-bet events: a
 * winning wager graded through core flows into the session feed and shows up in
 * the ticker. On a fresh book it stays present as a quiet "Live wins" rail in its
 * empty state (no rows) rather than disappearing. Drives the actual feed (no mocks)
 * with fake timers for the feed's short release delay.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Account } from '../core/index.js'
import { placeWager, resolveWager } from '../core/index.js'
import { clearLedger } from './ledger-store.js'
import { ActivityTicker } from './ActivityTicker.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  clearLedger()
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('ActivityTicker', () => {
  it('stays present as an empty "Live wins" rail when there has been no activity', () => {
    act(() => root.render(<ActivityTicker />))
    const ticker = host.querySelector('.activity')
    expect(ticker).not.toBeNull()
    expect(ticker?.classList.contains('activity--empty')).toBe(true)
    expect(host.querySelector('.activity-row')).toBeNull()
  })

  it('shows a recent win once a bet resolves through core', () => {
    const acct: Account = { id: 'p1', creditLimit: 100_000, balance: 0, pending: 0 }
    const w = placeWager(acct, 1000)
    resolveWager(acct, w, 'win', 6) // 6× → +5000 profit, a big win
    // the session feed releases the held entry after its short anti-spoiler delay
    act(() => vi.advanceTimersByTime(60))

    act(() => root.render(<ActivityTicker />))

    const ticker = host.querySelector('.activity')
    expect(ticker).not.toBeNull()
    const row = host.querySelector('.activity-row')
    expect(row).not.toBeNull()
    expect(row?.textContent).toMatch(/won/)
    expect(row?.classList.contains('is-big')).toBe(true) // 6× / +$50 is flagged big
  })
})
