// @vitest-environment happy-dom
/**
 * Every console section and tool carries a "?" help dot that explains, in plain language,
 * what that feature does. (The explanation text is always in the DOM — CSS reveals it on
 * hover/focus/tap — so it's assertable without simulating a hover.)
 */

import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getBook, listPlayers } from '../book-store.js'
import { ManagerConsole } from '../ManagerConsole.js'
import { __resetPermissions } from './permissions-store.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: { root: ReturnType<typeof createRoot>; host: HTMLElement }[] = []
function mount(): HTMLElement {
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
afterEach(() => {
  act(() => roots.forEach((r) => r.root.unmount()))
  roots.forEach((r) => r.host.remove())
  roots.length = 0
  __resetPermissions()
})

const helpTexts = (host: HTMLElement) =>
  [...host.querySelectorAll('.help-pop-text')].map((n) => n.textContent ?? '')
const section = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.mc-section')].find((b) => b.textContent === label)

describe('manager console help dots', () => {
  it('every section has a "?" dot that explains it', () => {
    const host = mount()
    // 6 sections → at least 6 help dots, each a button labelled "?"
    const dots = [...host.querySelectorAll<HTMLButtonElement>('.help-dot')]
    expect(dots.length).toBeGreaterThanOrEqual(6)
    expect(dots.every((d) => d.textContent === '?')).toBe(true)
    // a section's explanation is present (hidden until hovered, but in the DOM)
    expect(helpTexts(host).some((t) => /whole book at a glance/i.test(t))).toBe(true)
  })

  it('tools in a section each carry their own explanation', () => {
    const host = mount()
    act(() => section(host, 'Growth')!.click())
    const texts = helpTexts(host)
    expect(texts.some((t) => /per-game hold/i.test(t))).toBe(true) // Reporting
    expect(texts.some((t) => /bonuses to one player or a whole downline/i.test(t))).toBe(true) // Promotions
    // the dot sits beside its tool tab, grouped in a nav item
    expect(host.querySelector('.mc-tools .mc-navitem .mc-tab')).toBeTruthy()
    expect(host.querySelector('.mc-tools .mc-navitem .help-dot')).toBeTruthy()
  })
})
