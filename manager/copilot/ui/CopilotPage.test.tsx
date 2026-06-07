// @vitest-environment happy-dom
/**
 * Smoke test: the Copilot page renders, shows the snapshot figures, and lists at
 * least one advisory recommendation (with no captured play it advises on the dead
 * window). The analysis logic is unit-tested in insights.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { CopilotPage } from './CopilotPage.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CopilotPage (smoke)', () => {
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

  it('renders the snapshot + at least one recommendation', () => {
    act(() => root.render(<CopilotPage />))
    expect(host.querySelector('.mgr-cop-title')?.textContent).toMatch(/Copilot/i)
    expect(host.querySelectorAll('.mgr-fig').length).toBe(6) // snapshot figures
    expect(host.querySelectorAll('.mgr-rec').length).toBeGreaterThanOrEqual(1)
    // every recommendation carries an advisory "Suggested" step (advisory-only)
    expect(host.querySelector('.mgr-rec-action')?.textContent).toMatch(/Suggested/i)
  })
})
