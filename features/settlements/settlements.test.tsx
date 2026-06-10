// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ComponentType } from 'react'
import { SettlementRunPanel } from './SettlementRunPanel.js'
import settlementRunManifests from './manifest.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
  act(() => roots.forEach((r) => r.root.unmount()))
  roots.forEach((r) => r.host.remove())
  roots.length = 0
})

function mount(Panel: ComponentType<{ onBack: () => void }>, onBack: () => void = () => {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(<Panel onBack={onBack} />))
  roots.push({ root, host })
  return host
}

const clickBtn = (host: HTMLElement, re: RegExp) =>
  act(() =>
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => re.test(b.textContent ?? ''))!
      .click(),
  )

describe('Settlement Run manifest', () => {
  it('declares the operations tile with the full contract shape', () => {
    expect(settlementRunManifests).toHaveLength(1)
    const m = settlementRunManifests[0]
    expect(m.key).toBe('settlements-run')
    expect(m.name).toBe('Settlement Run')
    expect(m.section).toBe('operations')
    expect(m.icon).toBeTruthy() // a lucide component
    expect(typeof m.Panel).toBe('function')
  })
})

describe('SettlementRunPanel', () => {
  it('renders a themed body with no top bar', () => {
    expect(mount(SettlementRunPanel).querySelector('.feat-panel')).toBeTruthy()
  })

  it('renders the schedule card (cadence + next due)', () => {
    const host = mount(SettlementRunPanel)
    expect(host.textContent).toContain('Cadence')
    expect(host.textContent).toContain('days')
    expect(host.textContent).toContain('Next due')
  })

  it('renders the who-up/down preview with the book net and seeded members', () => {
    const host = mount(SettlementRunPanel)
    expect(host.textContent).toContain('Book net')
    // The demo book ships seeded players → the preview table renders rows.
    expect(host.querySelector('table[aria-label="Up and down"]')).toBeTruthy()
    expect(host.querySelectorAll('table[aria-label="Up and down"] tbody tr').length).toBeGreaterThan(
      0,
    )
  })

  it('locks the sheet and reveals the confirm without settling', () => {
    const host = mount(SettlementRunPanel)
    // Before review: no confirm, no frozen-sheet card.
    expect(host.querySelector('section[aria-label="Confirm settlement"]')).toBeNull()

    clickBtn(host, /Review settlement/)

    // The frozen sheet + the confirm button APPEAR (we never click "Yes, settle now").
    expect(host.querySelector('section[aria-label="Confirm settlement"]')).toBeTruthy()
    expect(host.textContent).toContain('Locked net')
    expect(host.textContent).toMatch(/frozen at review time/i)
    const confirm = [...host.querySelectorAll('button')].find((b) =>
      /Yes, settle now/.test(b.textContent ?? ''),
    )
    expect(confirm).toBeTruthy()
    // The carryover (soft-close) toggle is offered on the locked sheet.
    expect(host.querySelector('input[type="checkbox"]')).toBeTruthy()
  })

  it('Cancel clears the frozen sheet (still no settle)', () => {
    const host = mount(SettlementRunPanel)
    clickBtn(host, /Review settlement/)
    expect(host.querySelector('section[aria-label="Confirm settlement"]')).toBeTruthy()
    clickBtn(host, /Cancel/)
    expect(host.querySelector('section[aria-label="Confirm settlement"]')).toBeNull()
  })

  it('renders the recent-archive tail (read-only)', () => {
    const host = mount(SettlementRunPanel)
    expect(host.querySelector('section[aria-label="Recent settlements"]')).toBeTruthy()
    expect(host.textContent).toMatch(/full archive is the Settlements tile/i)
  })
})
