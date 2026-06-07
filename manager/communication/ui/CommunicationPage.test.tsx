// @vitest-environment happy-dom
/**
 * Smoke test: the Communication page renders, and publishing an announcement (no
 * webhook push) adds it to the posted list. Dispatch + store logic are unit-tested
 * in webhooks.test.ts / comms-store.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { CommunicationPage } from './CommunicationPage.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function setValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('CommunicationPage (smoke)', () => {
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

  it('publishes an announcement into the posted list', () => {
    act(() => root.render(<CommunicationPage />))
    expect(host.querySelector('.mgr-comms-title')?.textContent).toMatch(/Communication/i)

    const before = host.querySelectorAll('.mgr-ann').length
    const ta = host.querySelector('.mgr-textarea') as HTMLTextAreaElement
    act(() => setValue(ta, 'Maintenance tonight at 9pm'))
    const publish = [...host.querySelectorAll('button')].find((b) => /^Publish$/.test(b.textContent ?? '')) as HTMLButtonElement
    act(() => publish.click())

    expect(host.querySelectorAll('.mgr-ann').length).toBe(before + 1)
    expect(host.querySelector('.mgr-comms-status')?.textContent).toMatch(/Published/)
  })
})
