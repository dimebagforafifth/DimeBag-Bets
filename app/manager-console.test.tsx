// @vitest-environment happy-dom
/** The manager console sub-nav switches between the operator sections. */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getBook, listPlayers } from './book-store.js'
import { ManagerConsole } from './ManagerConsole.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ManagerConsole', () => {
  it('renders a sub-nav and switches sections', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() =>
      root.render(
        <ManagerConsole
          org={getBook()}
          onMutate={() => {}}
          players={listPlayers().map((p) => ({ id: p.id, name: p.name }))}
        />,
      ),
    )

    const tab = (label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('.mc-tab')].find((t) => t.textContent === label)!
    expect(tab('Risk')).toBeTruthy()

    act(() => tab('Risk').click())
    expect(host.textContent).toContain('Risk & exposure')

    act(() => tab('Settlement').click())
    expect(host.textContent).toContain('Settlement history')

    act(() => tab('Audit').click())
    expect(host.textContent).toContain('Audit log')

    act(() => root.unmount())
    host.remove()
  })

  it('mounts the growth/insight suite — every new tab is reachable and renders its page', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() =>
      root.render(
        <ManagerConsole
          org={getBook()}
          onMutate={() => {}}
          players={listPlayers().map((p) => ({ id: p.id, name: p.name }))}
        />,
      ),
    )

    const tab = (label: string) =>
      [...host.querySelectorAll<HTMLButtonElement>('.mc-tab')].find((t) => t.textContent === label)

    // Each newly mounted tab: its nav button exists, and clicking it renders that
    // page (asserted via the page's own title element). These six were built and
    // tested standalone but unmounted until now.
    const PAGES: { label: string; titleSel: string; titleRe: RegExp }[] = [
      { label: 'Reporting', titleSel: '.mgr-report-title', titleRe: /Reporting/i },
      { label: 'Copilot', titleSel: '.mgr-cop-title', titleRe: /Copilot/i },
      { label: 'Promotions', titleSel: '.mgr-promo-title', titleRe: /Promotions/i },
      { label: 'Loyalty', titleSel: '.mgr-loy-title', titleRe: /Loyalty/i },
      { label: 'Communication', titleSel: '.mgr-comms-title', titleRe: /Communication/i },
      { label: 'Branding', titleSel: '.mgr-brand-title', titleRe: /Branding/i },
    ]

    for (const p of PAGES) {
      const btn = tab(p.label)
      expect(btn, `tab "${p.label}" should be present`).toBeTruthy()
      act(() => btn!.click())
      const title = host.querySelector(p.titleSel)?.textContent
      expect(title, `page for "${p.label}" should render`).toMatch(p.titleRe)
    }

    act(() => root.unmount())
    host.remove()
  })
})
