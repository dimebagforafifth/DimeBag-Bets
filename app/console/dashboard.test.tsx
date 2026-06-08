// @vitest-environment happy-dom
/** The dashboard renders its KPIs from the live reporting / exposure / book stores. */
import { describe, expect, it, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { membersByRole } from '../../org/index.js'
import { getBook } from '../book-store.js'
import { Dashboard } from './Dashboard.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: ReturnType<typeof createRoot>
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Dashboard', () => {
  it('renders the KPI tiles and lists from real stores', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root.render(<Dashboard />))

    const labels = [...host.querySelectorAll('.con-kpi-label')].map((e) => e.textContent)
    expect(labels).toEqual(
      expect.arrayContaining(['Turnover', 'Hold', 'Active players', 'Live exposure']),
    )

    // The KPI count tiles are present and numeric (turnover/exposure render money).
    expect(host.querySelectorAll('.con-kpi-value').length).toBe(4)

    // Reads the real book: the "active players" hint reports the live player count.
    const total = membersByRole(getBook(), 'player').length
    expect(host.textContent).toContain(`of ${total} on the book`)

    // The two breakdown cards render.
    expect(host.textContent).toContain('Biggest pending bets')
    expect(host.textContent).toContain('Open exposure by game')

    // Range selector defaults to 7 days.
    const active = host.querySelector('.con-range-btn.is-on')
    expect(active?.textContent).toBe('7 days')
  })
})
