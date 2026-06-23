// @vitest-environment happy-dom
/**
 * The player panel renders the hub and auto-claims earned free-play in real time:
 * completing a mission (via play events) credits the account through core on the next
 * render — not an overnight batch.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Account } from '../../../core/index.js'
import { __resetGamification, recordPlay } from '../store.js'
import { GamificationPanel } from './GamificationPanel.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('GamificationPanel', () => {
  beforeEach(() => __resetGamification())

  it('renders the hub and auto-claims completed rewards as free-play', () => {
    const account: Account = { id: 'u1', creditLimit: 1_000_000_000, balance: 0, pending: 0 }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<GamificationPanel account={account} players={[{ id: 'u1', name: 'You' }]} />))

    expect(host.textContent).toContain('Rewards')
    expect(host.textContent).toContain('Missions')
    expect(host.querySelector('.gam-spin')).toBeTruthy()

    // Complete the daily 3-bets mission via real-time play events → panel re-renders →
    // its auto-claim effect pays the mission + first-bet achievement through core.
    act(() => {
      for (let i = 0; i < 3; i++) recordPlay('u1', { stake: 100, profit: -100, outcome: 'loss' }, Date.now())
    })
    expect(account.balance).toBe(75) // $0.50 mission + $0.25 first-bet achievement

    act(() => root.unmount())
    host.remove()
  })

  it('spins the wheel from the UI and then disables the button (one spin per cooldown)', () => {
    const account: Account = { id: 'u2', creditLimit: 1_000_000_000, balance: 0, pending: 0 }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<GamificationPanel account={account} />))

    const spin = host.querySelector<HTMLButtonElement>('.gam-spin')!
    expect(spin.disabled).toBe(false)
    act(() => spin.click())
    expect(account.balance).toBeGreaterThanOrEqual(0) // paid the landed segment (≥ 0)
    expect(host.querySelector<HTMLButtonElement>('.gam-spin')!.disabled).toBe(true) // on cooldown

    act(() => root.unmount())
    host.remove()
  })
})
