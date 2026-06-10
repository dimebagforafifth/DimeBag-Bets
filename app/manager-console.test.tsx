// @vitest-environment happy-dom
/** The manager console is an app launcher: clicking an app tile opens that tool,
 *  and "All tools" returns to the grid. Every tool is reachable and renders. */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getBook, listPlayers } from './book-store.js'
import { ManagerConsole } from './ManagerConsole.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount() {
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
  return { host, root }
}
const tile = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.mc-app')].find((t) => t.textContent === label)
const back = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.mc-back')

describe('ManagerConsole (app launcher)', () => {
  it('opens a tool from its tile and returns via "All tools"', () => {
    const { host, root } = mount()
    // Home is the grid: app tiles present, no tool open yet.
    expect(host.querySelectorAll('.mc-app').length).toBeGreaterThan(0)
    expect(back(host)).toBeNull()

    // Open Risk → its panel renders; back → the grid returns.
    act(() => tile(host, 'Risk')!.click())
    expect(host.textContent).toContain('Risk & exposure')
    expect(back(host)).not.toBeNull()
    act(() => back(host)!.click())
    expect(host.querySelectorAll('.mc-app').length).toBeGreaterThan(0)

    // Settlement and Audit are reachable the same way.
    act(() => tile(host, 'Settlement')!.click())
    expect(host.textContent).toContain('Settlement history')
    act(() => back(host)!.click())
    act(() => tile(host, 'Audit')!.click())
    expect(host.textContent).toContain('Audit log')

    act(() => root.unmount())
    host.remove()
  })

  it('mounts the growth/insight suite — every tile opens its page', () => {
    const { host, root } = mount()

    // Each tile: present on the grid, and clicking it renders that page (asserted
    // via the page's own title element). These were built standalone, now reachable.
    const PAGES: { label: string; titleSel: string; titleRe: RegExp }[] = [
      { label: 'Reporting', titleSel: '.mgr-report-title', titleRe: /Reporting/i },
      { label: 'Copilot', titleSel: '.mgr-cop-title', titleRe: /Copilot/i },
      { label: 'Promotions', titleSel: '.mgr-promo-title', titleRe: /Promotions/i },
      { label: 'Loyalty', titleSel: '.mgr-loy-title', titleRe: /Loyalty/i },
      { label: 'Communication', titleSel: '.mgr-comms-title', titleRe: /Communication/i },
      { label: 'Branding', titleSel: '.mgr-brand-title', titleRe: /Branding/i },
    ]

    for (const p of PAGES) {
      const t = tile(host, p.label)
      expect(t, `tile "${p.label}" should be present`).toBeTruthy()
      act(() => t!.click())
      const title = host.querySelector(p.titleSel)?.textContent
      expect(title, `page for "${p.label}" should render`).toMatch(p.titleRe)
      act(() => back(host)!.click()) // return to the grid for the next one
    }

    act(() => root.unmount())
    host.remove()
  })
})
