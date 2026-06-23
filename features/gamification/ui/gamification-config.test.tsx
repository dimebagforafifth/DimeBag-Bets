// @vitest-environment happy-dom
/** The operator config page renders and edits the live config through the engine. */
import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { __resetGamification, getConfig } from '../store.js'
import { GamificationConfigPage } from './GamificationConfigPage.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function setValue(el: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!
  setter.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('GamificationConfigPage', () => {
  beforeEach(() => __resetGamification())

  it('renders, edits a mission reward through the store, and switches tabs', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<GamificationConfigPage />))

    expect(host.textContent).toContain('Gamification')
    expect(host.textContent).toContain('Warm up') // first default mission (missions tab is default)

    // Missions row 0 = daily-3-bets: inputs are [target, reward$, xp]; edit the reward.
    const nums = host.querySelectorAll<HTMLInputElement>('.gamc-num')
    const reward = nums[1]
    act(() => {
      setValue(reward, '2') // $2.00
      reward.dispatchEvent(new Event('focusout', { bubbles: true })) // React onBlur delegate
    })
    expect(getConfig().missions[0].rewardCents).toBe(200)

    // Switch to the wheel tab → win-chance column shows.
    const wheelTab = [...host.querySelectorAll<HTMLButtonElement>('.gamc-tab')].find((b) => b.textContent === 'Reward wheel')!
    act(() => wheelTab.click())
    expect(host.textContent).toContain('Win chance')

    act(() => root.unmount())
    host.remove()
  })
})
