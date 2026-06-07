// @vitest-environment happy-dom
/**
 * Smoke test: the Loyalty page renders the tier ladder and toggling "Live to
 * players" writes through to the VIP config. The program's edit rules
 * (threshold monotonicity, etc.) are covered by vip's own tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { LoyaltyPage } from './LoyaltyPage.js'
import { getVipConfig } from '../../../app/vip-store.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('LoyaltyPage (smoke)', () => {
  let host: HTMLElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('renders tiers and toggles release through the VIP config', () => {
    act(() => root.render(<LoyaltyPage />))
    expect(host.querySelector('.mgr-loy-title')?.textContent).toMatch(/Loyalty/i)
    // bronze→diamond editable tiers ('none' floor excluded)
    expect(host.querySelectorAll('.mgr-table tbody tr').length).toBe(5)

    const before = getVipConfig().released
    const releaseSwitch = host.querySelector('.mgr-loy-switch') as HTMLButtonElement
    act(() => releaseSwitch.click())
    expect(getVipConfig().released).toBe(!before) // wrote through to the live config
  })
})
