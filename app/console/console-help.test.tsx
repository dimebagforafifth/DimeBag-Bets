// @vitest-environment happy-dom
/**
 * The manager console explains itself in plain language: each section shows a one-line
 * intro, and each tool shows a friendly description strip above it (always visible — no
 * hover, no cryptic icon).
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

const section = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.mc-section')].find((b) => b.textContent === label)
const tool = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('.mc-tools .mc-tab')].find((b) => b.textContent === label)

describe('manager console plain-language help', () => {
  it('shows a section intro and the active tool description', () => {
    const host = mount() // opens on Dashboard
    expect(host.querySelector('.mc-blurb')?.textContent).toMatch(/whole book at a glance/i)
    const note = host.querySelector('.mc-toolnote')
    expect(note?.textContent).toMatch(/Overview/) // the tool name leads the strip
    expect(note?.textContent).toMatch(/total figure, live exposure/i) // its description
  })

  it('updates the description as you move between sections and tools', () => {
    const host = mount()
    act(() => section(host, 'Growth')!.click())
    expect(host.querySelector('.mc-blurb')?.textContent).toMatch(/grow the book/i)
    expect(host.querySelector('.mc-toolnote')?.textContent).toMatch(/per-game hold/i) // Reporting

    act(() => tool(host, 'Promotions')!.click())
    expect(host.querySelector('.mc-toolnote')?.textContent).toMatch(
      /bonuses to one player or a whole downline/i,
    )
  })
})
