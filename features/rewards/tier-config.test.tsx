// @vitest-environment happy-dom
/** Tier Config — the friendlier editor: a live ladder preview, perks edited as add/remove
 *  chips, and one-click reorder. No coins anywhere. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TierConfigPanel } from './TierConfigPanel.js'
import { getRewardsConfig, resetRewardsConfig } from '../../rewards/economy.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  resetRewardsConfig()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function setValue(el: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const byText = (t: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent === t)

describe('Tier Config — friendlier editor', () => {
  beforeEach(() => act(() => root.render(<TierConfigPanel onBack={() => {}} />)))

  it('renders a live ladder preview of every tier in threshold order', () => {
    const preview = host.querySelector('.rwa-ladder')!
    expect(preview).not.toBeNull()
    expect(preview.querySelectorAll('.rwa-ladder-step').length).toBe(getRewardsConfig().tiers.length)
    expect(preview.textContent).toMatch(/Rookie/)
    expect(preview.textContent).toMatch(/Diamond/)
    expect(host.textContent).not.toMatch(/coin/i)
  })

  it('adds a perk as a chip via the inline field', () => {
    const input = [...host.querySelectorAll<HTMLInputElement>('input')].find(
      (i) => i.getAttribute('aria-label') === 'Add a perk to Rookie',
    )!
    expect(input).toBeTruthy()
    act(() => setValue(input, 'VIP welcome gift'))
    act(() => byText('Add')[0].click()) // first tier's perk "Add"
    expect(getRewardsConfig().tiers[0].perks).toContain('VIP welcome gift')
    const chips = [...host.querySelectorAll('.rwa-chip')].map((c) => c.textContent).join(' | ')
    expect(chips).toMatch(/VIP welcome gift/)
  })

  it('reorders tiers with the ↓ control', () => {
    const firstId = getRewardsConfig().tiers[0].id // 'rookie'
    const moveDown = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.getAttribute('aria-label') === 'Move Rookie down',
    )!
    act(() => moveDown.click())
    expect(getRewardsConfig().tiers[0].id).not.toBe(firstId)
    expect(getRewardsConfig().tiers[1].id).toBe(firstId)
  })
})
