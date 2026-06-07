// @vitest-environment happy-dom
/**
 * Render smoke test for the full Baccarat table: the five felt spots show their
 * odds, dropping a chip stakes a spot (multi-bet), dealing lays real card faces
 * (not face-down backs), settles the wager, and after the card-by-card reveal a
 * winner chip + result line + a scoreboard entry land. Outcome is seed-random, so
 * we assert the FLOW, not a specific winner.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Account } from '../../../core/index.js'
import { BaccaratGame } from './BaccaratGame.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function account(): Account {
  return { id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0 }
}
function clickSel(host: HTMLElement, selector: string): boolean {
  const el = host.querySelector<HTMLElement>(selector)
  if (!el) return false
  act(() => el.click())
  return true
}
function clickText(host: HTMLElement, selector: string, text: RegExp): boolean {
  const el = [...host.querySelectorAll<HTMLElement>(selector)].find((n) => text.test(n.textContent ?? ''))
  if (!el) return false
  act(() => el.click())
  return true
}

describe('BaccaratGame (full table)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stakes a spot, deals real cards card-by-card, and reveals a winner + scoreboard', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const acct = account()
    act(() => root.render(<BaccaratGame account={acct} onBalanceChange={() => {}} />))

    // Five felt spots with their odds.
    const spots = [...host.querySelectorAll('.baccarat-spot')]
    expect(spots.map((s) => s.querySelector('.baccarat-spot-name')?.textContent)).toEqual([
      'Player Pair',
      'Player',
      'Tie',
      'Banker',
      'Banker Pair',
    ])
    // Banker shows its 1:1 payout AND the 5% commission, never buried.
    expect(host.querySelector('.baccarat-spot.is-banker .baccarat-spot-odds')?.textContent).toBe('1:1 −5%')
    expect(host.querySelector('.baccarat-spot.is-player .baccarat-spot-odds')?.textContent).toBe('1:1')
    expect(host.querySelector('.baccarat-spot.is-tie .baccarat-spot-odds')?.textContent).toBe('8:1')
    expect(host.querySelector('.baccarat-spot.is-playerPair .baccarat-spot-odds')?.textContent).toBe('11:1')

    // Pre-deal: only face-down backs, no face cards, no chips on the felt.
    expect(host.querySelectorAll('.baccarat-card.is-back').length).toBe(4)
    expect(host.querySelectorAll('.baccarat-card:not(.is-back)').length).toBe(0)
    expect(host.querySelector('.baccarat-chiptoken')).toBeNull()

    // Drop a chip on Banker → a chip token appears and the staked total updates.
    expect(clickSel(host, '.baccarat-spot.is-banker')).toBe(true)
    expect(host.querySelector('.baccarat-spot.is-banker .baccarat-chiptoken')).not.toBeNull()
    expect(host.querySelector('.baccarat-staked-value')?.textContent).not.toBe('$0.00')

    // Deal.
    expect(clickText(host, 'button.action', /^Deal$/)).toBe(true)
    expect(acct.pending).toBe(0) // the round settled at deal; nothing stranded
    expect(host.querySelector('.baccarat-result')?.textContent).toBe('Dealing…')

    // Play out the card-by-card deal + the settle beat. Advance in steps so each
    // card's state update + the next timer it schedules flush between advances.
    for (let i = 0; i < 12; i++) act(() => vi.advanceTimersByTime(360))

    // Real cards on the felt, a winner chip, a result line, and a scoreboard entry.
    expect(host.querySelectorAll('.baccarat-card:not(.is-back)').length).toBeGreaterThanOrEqual(4)
    expect(host.querySelector('.baccarat-winner')).not.toBeNull()
    expect(host.querySelector('.baccarat-result')?.textContent ?? '').toMatch(/win|lose|push|Tie/i)
    expect(host.querySelectorAll('.baccarat-bead-cell').length).toBeGreaterThan(0)

    act(() => root.unmount())
    host.remove()
  })
})
