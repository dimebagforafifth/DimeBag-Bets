/**
 * Boosts UI (happy-dom). The admin panel seeds + lists boosts and composes a new one; the player
 * section shows the offers available to a player. Read/compose only — no money asserted here (the
 * grant path is covered in engine.test.ts).
 */

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BoostsPanel } from './ui/BoostsPanel.js'
import { BoostsSection } from './ui/BoostsSection.js'
import { __resetBoosts, getBoosts, seedBoostsDemo } from './store.js'
import { __disarmBoostEngine } from './engine.js'
import { __resetBonusEngine } from '../bonus/index.js'
import { __resetBets } from '../../app/book/bets-store.js'
import { resetRewardsConfig, __resetIssuance } from '../rewards/economy.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root

function resetAll(): void {
  __disarmBoostEngine()
  __resetBoosts()
  __resetBonusEngine()
  __resetBets()
  resetRewardsConfig()
  __resetIssuance()
}

beforeEach(() => {
  resetAll()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  resetAll()
})

const text = (): string => host.textContent ?? ''
const setInput = (el: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('BoostsPanel', () => {
  it('seeds + lists boosts and renders the composer', () => {
    act(() => root.render(<BoostsPanel onBack={() => {}} />))
    expect(text()).toContain('Boosts')
    expect(text()).toContain('Compose a boost')
    expect(text()).toContain('NBA SGP Price Boost +20%') // seeded on mount
    expect(getBoosts().length).toBeGreaterThanOrEqual(2)
  })

  it('composes a new boost', () => {
    act(() => root.render(<BoostsPanel onBack={() => {}} />))
    const nameInput = host.querySelector('.boosts-field-wide input') as HTMLInputElement
    setInput(nameInput, 'My Test Boost')
    const create = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Create boost',
    )!
    act(() => create.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(getBoosts().some((b) => b.name === 'My Test Boost')).toBe(true)
    expect(text()).toContain('My Test Boost')
  })
})

describe('BoostsSection (player)', () => {
  it('shows the offers available to an eligible player', () => {
    seedBoostsDemo(1_750_000_000_000)
    act(() => root.render(<BoostsSection viewerId="p-lena" />))
    expect(text()).toContain('Boosts')
    // NBA SGP boost has empty eligibility → available to any player.
    expect(text()).toContain('NBA SGP Price Boost +20%')
  })
})
