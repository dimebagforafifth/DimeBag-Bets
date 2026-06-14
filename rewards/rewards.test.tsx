// @vitest-environment happy-dom
/** The Rewards section: every sub-view renders populated, the claim flow works, the
 *  player's leaderboard rank shows, and NOTHING renders a "$"/cash path — coins only. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RewardsSection } from './index.js'
import { VIEWS } from './data.js'
import { __resetRewardsPlayers } from './players.js'
import { resetRewardsConfig, __resetIssuance, totalIssued } from './economy.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetRewardsPlayers()
  resetRewardsConfig()
  __resetIssuance()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = () =>
  act(() => root.render(<RewardsSection playerName="Marco" balanceCoins={12_500} />))
const text = () => host.textContent ?? ''
const tab = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.rw-tab')].find((b) => b.textContent?.includes(name))
const openView = (name: string) => act(() => tab(name)!.click())

describe('Rewards section', () => {
  it('lands on the overview with rank, balance, and quick links — coins only', () => {
    render()
    expect(host.querySelector('.rw-h1')?.textContent).toBe('Rewards')
    expect(text()).toMatch(/tier/i) // current rank
    expect(text()).toMatch(/coins/) // amounts are in coins
    expect(text()).not.toMatch(/\$\d/) // never a dollar amount
    // one sub-nav tab per view, plus quick-link tiles into the sub-views
    expect(host.querySelectorAll('.rw-tab')).toHaveLength(VIEWS.length)
    expect(host.querySelectorAll('.rw-tile').length).toBeGreaterThan(0)
  })

  it('renders every sub-view populated', () => {
    render()
    // Ranks — the tier ladder
    openView('Ranks')
    expect(text()).toMatch(/Diamond/)
    expect(text()).toMatch(/wagered/i)
    // Leaderboards — the player's own rank shows + a table
    openView('Leaderboards')
    expect(host.querySelector('.rw-table')).not.toBeNull()
    expect(host.querySelector('.rw-table tr.is-you')).not.toBeNull()
    expect(text()).toMatch(/Marco/)
    // Store — items with coin costs, no cash
    openView('Store')
    expect(text()).toMatch(/Free Play|Coin Pack/i)
    expect(text()).not.toMatch(/\$\d/)
    // Daily — the 7-day cycle
    openView('Daily')
    expect(text()).toMatch(/Day/)
    // Challenges — missions with progress
    openView('Challenges')
    expect(host.querySelectorAll('.rw-progress').length).toBeGreaterThan(0)
    // Badges — earned + locked
    openView('Badges')
    expect(host.querySelectorAll('.rw-badge').length).toBeGreaterThan(0)
    expect(text()).toMatch(/unlocked/i)
  })

  it('shows only THIS player’s own status & rewards (own-only)', () => {
    // Marco — seeded Gold tier at 68,400 status
    act(() => root.render(<RewardsSection memberId="p-marco" playerName="Marco" balanceCoins={12_500} />))
    expect(text()).toMatch(/68,400/) // Marco's status
    expect(text()).toMatch(/Gold/)

    // Dana — a different player, different standing; never Marco's numbers
    act(() => root.render(<RewardsSection memberId="p-dana" playerName="Dana" balanceCoins={50_000} />))
    expect(text()).toMatch(/540,000/) // Dana's status
    expect(text()).toMatch(/Platinum/)
    expect(text()).not.toMatch(/68,400/)
  })

  it('claims the daily bonus (coins credited + tracked in the economy ledger, never cash)', () => {
    render()
    const before = totalIssued()
    const claimBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === 'Claim',
    )!
    expect(claimBtn).toBeTruthy()
    act(() => claimBtn.click())
    expect(host.querySelector('.rw-saved')?.textContent).toMatch(/Daily bonus claimed/)
    // the claim counted toward the economy's running total (no longer bypasses the cap)
    expect(totalIssued()).toBeGreaterThan(before)
    expect(text()).not.toMatch(/\$\d/)
  })
})
