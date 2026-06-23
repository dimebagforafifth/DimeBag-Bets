// @vitest-environment happy-dom
/** The Trading Desk tile renders its sections and drives the stores: switching to "agent" can't
 *  widen margin below the manager floor; suspend/override/limit controls write the live stores. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TradingDeskPanel } from './TradingDeskPanel.js'
import { __resetTrading } from './seed.js'
import { marginFloor, resolvePricingConfig } from '../../lib/odds/pricing-config.js'
import { listSuspensions } from './suspensions.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetTrading()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  __resetTrading()
})

const render = () => act(() => root.render(<TradingDeskPanel />))
const text = () => host.textContent ?? ''
const buttons = () => [...host.querySelectorAll('button')]
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const tab = (label: string) => click(buttons().find((b) => b.textContent === label)!)

describe('TradingDeskPanel', () => {
  it('seeds and renders the pricing surface with a live hold readout', () => {
    render()
    expect(host.querySelector('.td-h')?.textContent).toMatch(/Pricing config/)
    tab('Hold')
    expect(text()).toMatch(/Hold%/)
    // a real book holds positive margin on a known market
    expect(host.querySelector('.td-hold')?.textContent).toMatch(/%/)
  })

  it('lists the seeded suspension and lifts it', () => {
    render()
    tab('Suspensions')
    expect(text()).toContain('prop') // seeded suspension
    expect(listSuspensions().some((s) => s.scope_key === 'prop')).toBe(true)
    click(buttons().find((b) => b.textContent === 'Lift')!)
    expect(listSuspensions().some((s) => s.scope_key === 'prop')).toBe(false)
  })

  it('an agent moving the global margin can’t widen below the manager floor', () => {
    render()
    // turn on "Acting as agent"
    const agentToggle = host.querySelector('input[type="checkbox"]') as HTMLInputElement
    act(() => {
      agentToggle.checked = true
      agentToggle.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const floor = marginFloor() // bps
    const range = host.querySelector('input[aria-label="global margin"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!
      setter.call(range, '0') // try to widen margin to 0
      range.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(resolvePricingConfig().marginBps).toBeGreaterThanOrEqual(floor)
  })
})
