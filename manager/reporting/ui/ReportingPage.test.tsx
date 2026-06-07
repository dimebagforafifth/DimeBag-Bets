// @vitest-environment happy-dom
/**
 * Smoke test: the Reporting page mounts cleanly (wiring + imports), renders its
 * title and the date-range tabs, and shows the empty state before any activity. The
 * analytics math itself is covered in analytics.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ReportingPage } from './ReportingPage.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ReportingPage (smoke)', () => {
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

  it('renders the title and the range tabs', () => {
    act(() => root.render(<ReportingPage />))
    expect(host.querySelector('.mgr-report-title')?.textContent).toMatch(/Reporting/i)
    const tabs = [...host.querySelectorAll('.mgr-range-btn')].map((b) => b.textContent)
    expect(tabs).toEqual(['24h', '7 days', '30 days', 'All time'])
    // With no captured activity, the empty-state copy shows instead of tables.
    expect(host.querySelector('.mgr-report-empty')).not.toBeNull()
  })
})
