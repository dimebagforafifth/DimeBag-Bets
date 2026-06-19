// @vitest-environment happy-dom
/** The Billing & Invoices panel renders the fiat header, the live this-week projection, the
 *  invoice list, and the rate config; Generate persists an invoice; a non-manager is read-only. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BillingPanel } from './BillingPanel.js'
import { __resetBilling, listPeriods } from './store.js'
import { setViewer } from '../app/viewer.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root

beforeEach(() => {
  setViewer('mgr', 'manager')
  __resetBilling()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  setViewer('mgr', 'manager')
})

const render = () => act(() => root.render(<BillingPanel onBack={() => {}} />))
const text = () => host.textContent ?? ''
const buttons = () => [...host.querySelectorAll('button')]
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

describe('BillingPanel', () => {
  it('renders the fiat header, this-week projection, and rate config', () => {
    render()
    expect(host.querySelector('.feat-h1')?.textContent).toContain('Billing')
    expect(text()).toContain('per active player per week')
    expect(text()).toContain('This week')
    expect(text()).toContain('Active heads')
    expect(text()).toContain('Projected fee')
    expect(text()).toContain('Base rate')
  })

  it('starts with no invoices, then Generate persists one', () => {
    render()
    expect(text()).toContain('No invoices yet')
    expect(listPeriods()).toHaveLength(0)
    click(buttons().find((b) => b.textContent === 'Generate invoice')!)
    expect(listPeriods()).toHaveLength(1)
    expect(host.querySelector('.bil-pill')).toBeTruthy()
  })

  it('opens an invoice to its per-head breakdown with export controls', () => {
    render()
    click(buttons().find((b) => b.textContent === 'Generate invoice')!)
    click(buttons().find((b) => b.textContent === 'View')!)
    expect(text()).toContain('Heads (')
    expect(buttons().some((b) => b.textContent?.includes('CSV'))).toBe(true)
    expect(buttons().some((b) => b.textContent?.includes('JSON'))).toBe(true)
  })

  it('is read-only for a non-manager (Generate disabled)', () => {
    setViewer('a-1', 'agent')
    render()
    const gen = buttons().find((b) => b.textContent === 'Generate invoice') as HTMLButtonElement
    expect(gen.disabled).toBe(true)
  })
})
