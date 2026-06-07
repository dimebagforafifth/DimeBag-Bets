// @vitest-environment happy-dom
/**
 * Smoke test: the Branding page renders, previews the money format live from the
 * draft, and reflects a presentation change (symbol position) in the preview before
 * saving. Config normalization + the store are unit-tested elsewhere.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { BrandingPage } from './BrandingPage.js'
import { resetMoneyDisplay } from '../../../games/shared/presentation.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('BrandingPage (smoke)', () => {
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
    resetMoneyDisplay()
  })

  it('renders and previews a presentation change live (before save)', () => {
    act(() => root.render(<BrandingPage />))
    expect(host.querySelector('.mgr-brand-title')?.textContent).toMatch(/Branding/i)

    const balance = () => host.querySelector('.mgr-preview-figs strong')?.textContent
    expect(balance()).toBe('$1,234.56') // default display

    // Move the symbol after → preview updates from the draft immediately.
    const after = [...host.querySelectorAll('.mgr-toggle button')].find((b) => /After/.test(b.textContent ?? ''))
    expect(after).toBeTruthy()
    act(() => (after as HTMLButtonElement).click())
    expect(balance()).toBe('1,234.56 $')

    // Save is enabled once the draft diverges from the saved config.
    const save = [...host.querySelectorAll('button')].find((b) => /Save & apply/.test(b.textContent ?? '')) as HTMLButtonElement
    expect(save).toBeTruthy()
    expect(save.disabled).toBe(false)
  })
})
