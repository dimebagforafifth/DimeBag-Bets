// @vitest-environment happy-dom
/** Collections — per-agent collect/pay worklist over the seeded book. */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { setActiveEconomyTenant, setEconomyPolicy, __resetEconomy } from '../../core/index.js'
import { __resetEconomyConfig } from '../../app/economy-config.js'
import { collectionsManifests } from './manifest.js'
import { CollectionsPanel } from './CollectionsPanel.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Flip the active book to the wallet economy money-neutrally (no migration) for label tests. */
function setBalanceMode() {
  setActiveEconomyTenant('default')
  setEconomyPolicy({ mode: 'balance', balanceFloorCents: 0 }, 'default')
}
afterEach(() => {
  __resetEconomyConfig()
  __resetEconomy()
})

function setValue(el: HTMLSelectElement, v: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}
function mount() {
  const h = document.createElement('div')
  document.body.appendChild(h)
  const root = createRoot(h)
  act(() => root.render(<CollectionsPanel onBack={() => {}} />))
  return { h, root }
}

describe('collections manifest', () => {
  it('exposes the operations tile in the contract shape', () => {
    expect(collectionsManifests.map((m) => m.key)).toEqual(['collections'])
    const m = collectionsManifests[0]
    expect(m.section).toBe('operations')
    expect(m.icon).toBeTruthy()
    expect(typeof m.Panel).toBe('function')
  })
})

describe('CollectionsPanel', () => {
  it('buckets players under their nearest agent with a collect/pay direction', () => {
    const { h, root } = mount()
    // every agent bucket is present
    expect(h.textContent).toContain('East Desk')
    expect(h.textContent).toContain('West Desk')
    expect(h.textContent).toContain('North Region')
    // East Desk = Marco (−$450) + Lena (+$320) → net $130 to collect
    expect(h.textContent).toContain('$130.00')
    // West Desk = Tariq −$1,200 → all collect
    expect(h.textContent).toContain('$1,200.00')
    expect(h.textContent).toContain('Collect')
    expect(h.textContent).toContain('Pay')
    act(() => root.unmount())
    h.remove()
  })

  it('scoping to an agent drops to that agent’s individual players', () => {
    const { h, root } = mount()
    const scope = h.querySelector<HTMLSelectElement>('.scope-bar-select')!
    act(() => setValue(scope, 'a-e')) // East Desk
    expect(h.textContent).toContain('Marco')
    expect(h.textContent).toContain('Lena')
    expect(h.textContent).not.toContain('Tariq') // West Desk player is out of scope
    act(() => root.unmount())
    h.remove()
  })
})

describe('CollectionsPanel — economy mode framing', () => {
  it('credit mode (default) reads as a weekly collect/pay worklist', () => {
    const { h, root } = mount()
    const heads = [...h.querySelectorAll('thead th')].map((t) => t.textContent)
    expect(heads).toContain('To collect')
    expect(heads).toContain('To pay')
    expect(heads).toContain('Remit up')
    expect(h.textContent).toContain('Collect')
    // The weekly-close framing is present in credit mode (and unchanged).
    expect(h.querySelector('.feat-sub')?.textContent).toMatch(/weekly collect \/ pay/)
    act(() => root.unmount())
    h.remove()
  })

  it('balance mode drops every weekly-collect framing for a standing P&L roll-up', () => {
    setBalanceMode()
    const { h, root } = mount()
    const heads = [...h.querySelectorAll('thead th')].map((t) => t.textContent)
    // No weekly-collect framing: the collect/pay/remit columns relabel to up/down/nets-up.
    expect(heads).not.toContain('To collect')
    expect(heads).not.toContain('To pay')
    expect(heads).not.toContain('Remit up')
    expect(heads).toContain('Down')
    expect(heads).toContain('Up')
    expect(heads).toContain('Nets up')
    // The collect/pay DIRECTION words are gone; balances carry forward.
    expect(h.textContent).not.toMatch(/Collect/)
    expect(h.textContent).toMatch(/no weekly collect/)
    expect(h.querySelector('.feat-sub')?.textContent).not.toMatch(/resets every figure/)
    act(() => root.unmount())
    h.remove()
  })
})
