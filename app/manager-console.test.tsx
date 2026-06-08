// @vitest-environment happy-dom
/** The manager console: a two-level section/tool nav with progressive disclosure.
 *  Every operator tool stays reachable; advanced tools hide behind the toggle. */
import { describe, expect, it, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getBook, listPlayers } from './book-store.js'
import { ManagerConsole } from './ManagerConsole.js'
import { __resetPermissions } from './console/permissions-store.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
afterEach(() => {
  act(() => roots.forEach((r) => r.root.unmount()))
  roots.forEach((r) => r.host.remove())
  roots.length = 0
  __resetPermissions()
})

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
  roots.push({ root, host })
  return host
}

const section = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.mc-section')].find((b) => b.textContent === label)
const tool = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.mc-tools .mc-tab')].find(
    (b) => b.textContent === label,
  )
const advToggle = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.mc-adv-toggle')!

describe('ManagerConsole', () => {
  it('shows all six sections and opens on the Dashboard (full-access operator)', () => {
    const host = mount()
    for (const s of ['Dashboard', 'Daily ops', 'Players', 'Risk', 'Growth', 'Settings']) {
      expect(section(host, s), `section ${s}`).toBeTruthy()
    }
    expect(host.querySelector('.con-h1')?.textContent).toMatch(/Dashboard/)
  })

  it('each section opens its default tool', () => {
    const host = mount()
    act(() => section(host, 'Daily ops')!.click())
    expect(host.textContent).toContain('Settlement history')
    act(() => section(host, 'Risk')!.click())
    expect(host.textContent).toContain('Risk & exposure')
    act(() => section(host, 'Growth')!.click())
    expect(host.querySelector('.mgr-report-title')?.textContent).toMatch(/Reporting/i)
    act(() => section(host, 'Settings')!.click())
    expect(host.querySelector('.con-h1')?.textContent).toMatch(/Setup/)
  })

  it('progressive disclosure hides advanced tools until revealed', () => {
    const host = mount()
    act(() => section(host, 'Settings')!.click())
    // Branding is an advanced tool — hidden from the sub-nav at first.
    expect(tool(host, 'Branding')).toBeFalsy()
    act(() => advToggle(host).click())
    expect(tool(host, 'Branding')).toBeTruthy()
    act(() => tool(host, 'Branding')!.click())
    expect(host.querySelector('.mgr-brand-title')?.textContent).toMatch(/Branding/i)
  })

  it('keeps all six growth/insight pages reachable', () => {
    const host = mount()
    // Daily ops → Communication
    act(() => section(host, 'Daily ops')!.click())
    act(() => tool(host, 'Communication')!.click())
    expect(host.querySelector('.mgr-comms-title')?.textContent).toMatch(/Communication/i)
    // Growth → Promotions, then advanced → Copilot
    act(() => section(host, 'Growth')!.click())
    act(() => tool(host, 'Promotions')!.click())
    expect(host.querySelector('.mgr-promo-title')?.textContent).toMatch(/Promotions/i)
    act(() => advToggle(host).click())
    act(() => tool(host, 'Copilot')!.click())
    expect(host.querySelector('.mgr-cop-title')?.textContent).toMatch(/Copilot/i)
    // Players → Loyalty (advanced is a console-wide toggle, already on from above)
    act(() => section(host, 'Players')!.click())
    act(() => tool(host, 'Loyalty')!.click())
    expect(host.querySelector('.mgr-loy-title')?.textContent).toMatch(/Loyalty/i)
  })
})
