// @vitest-environment happy-dom
/** The Rewards hub renders the focused core (rank, rakeback, daily, free spins, store,
 *  leaderboard) and its claims/spins/demo controls drive REAL state. Credits only — no
 *  "coins" anywhere. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RewardsSection } from './index.js'
import { getPlayerRewards, __resetRewardsPlayers } from './players.js'
import { resetRewardsConfig } from './economy.js'
import { resetDemoClock } from './clock.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetRewardsPlayers()
  resetRewardsConfig()
  resetDemoClock()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (balanceCents = 12_500) =>
  act(() => root.render(<RewardsSection memberId="p-marco" playerName="Marco" balanceCents={balanceCents} />))
const text = () => host.textContent ?? ''
const card = (label: string) => host.querySelector(`[aria-label="${label}"]`)!
const btnIn = (label: string, contains: string) =>
  [...card(label).querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(contains))!

describe('Rewards hub', () => {
  it('renders the focused core — rank, rakeback, daily, free spins, store, leaderboard — no coins', () => {
    render()
    expect(host.querySelector('.rw-h1')?.textContent).toBe('Rewards')
    expect(text()).toMatch(/Rank/)
    expect(text()).toMatch(/Rakeback/)
    expect(text()).toMatch(/Daily bonus/)
    expect(text()).toMatch(/Free spins/)
    expect(text()).toMatch(/Store/)
    expect(text()).toMatch(/Top players/)
    expect(text()).not.toMatch(/coin/i)
  })

  it('claims rakeback into the balance (accrued zeroes)', () => {
    render()
    expect(getPlayerRewards('p-marco').rakebackAccrued).toBe(42_000) // seed
    act(() => btnIn('Rakeback', 'Claim').click())
    expect(getPlayerRewards('p-marco').rakebackAccrued).toBe(0)
  })

  it('a free spin decrements the count', () => {
    render()
    expect(getPlayerRewards('p-marco').freeSpins).toBe(3)
    act(() => btnIn('Free spins', 'Spin').click())
    expect(getPlayerRewards('p-marco').freeSpins).toBe(2)
  })

  it('claiming the daily bonus starts the streak', () => {
    render()
    expect(getPlayerRewards('p-marco').streak).toBe(0)
    act(() => btnIn('Daily bonus', 'Claim').click())
    expect(getPlayerRewards('p-marco').streak).toBe(1)
    expect(getPlayerRewards('p-marco').lastDailyAt).not.toBeNull()
  })

  it('the demo control simulates a wager that accrues rakeback', () => {
    render()
    const before = getPlayerRewards('p-marco').rakebackAccrued
    act(() => btnIn('Demo controls', 'Wager $500').click())
    // $500 wager × 5% rakeback = +$25 (2,500 cents)
    expect(getPlayerRewards('p-marco').rakebackAccrued).toBe(before + 2_500)
  })
})
