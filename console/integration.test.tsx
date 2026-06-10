// @vitest-environment happy-dom
/**
 * Console integration (post-wiring): the real, populated REGISTRY renders through the
 * shell — every feature is a tile with a real lucide icon, a tile opens its Panel in
 * the workspace, Esc (wired by each panel's PanelShell) and the shell's back control
 * both return to the grid, and a mounted panel adds no duplicate chrome.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Console } from './shell/index.js'
import { REGISTRY } from './registry/index.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: ReturnType<typeof createRoot>
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<Console />)) // default REGISTRY
  return host
}
const tiles = () => [...host.querySelectorAll<HTMLButtonElement>('.c-tile')]

describe('console integration — wired registry', () => {
  it('renders one tile per registered feature, each with a real lucide icon', () => {
    mount()
    expect(REGISTRY.length).toBeGreaterThanOrEqual(18) // ops5 + players6 + catalog5 + control4
    expect(tiles().length).toBe(REGISTRY.length)
    // every tile shows an svg icon, and lucide tags its svgs with a "lucide" class
    for (const t of tiles())
      expect(t.querySelector('.c-tile-icon svg'), t.textContent ?? '').not.toBeNull()
    expect(host.querySelector('.c-tile-icon svg[class*="lucide"]')).not.toBeNull()
  })

  it('clicking a tile mounts its Panel; Esc returns to the grid; no duplicate chrome', () => {
    mount()
    const tile = tiles().find((t) => /Weekly Figures/.test(t.textContent ?? ''))!
    act(() => tile.click())

    // the workspace + the panel body mounted; the grid is gone
    expect(host.querySelector('.c-workspace')).not.toBeNull()
    expect(host.textContent).toContain('Book figure') // WeeklyFigures panel body
    expect(host.querySelectorAll('.c-tile')).toHaveLength(0)
    // exactly ONE back affordance — the shell's WorkspaceContainer; the panel adds none
    expect(host.querySelectorAll('.c-back')).toHaveLength(1)

    // Esc (wired in the panel's PanelShell) returns to the grid
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(host.querySelectorAll('.c-tile')).toHaveLength(REGISTRY.length)
  })

  it('the shell back control also returns to the grid', () => {
    mount()
    act(() => tiles()[0].click())
    expect(host.querySelector('.c-workspace')).not.toBeNull()
    act(() => host.querySelector<HTMLButtonElement>('.c-back')!.click())
    expect(host.querySelectorAll('.c-tile')).toHaveLength(REGISTRY.length)
  })

  it('every section (Operations/Players/Catalog/Control) has at least one tile', () => {
    mount()
    const heads = [...host.querySelectorAll('.c-section-head')].map((n) => n.textContent)
    for (const s of ['Operations', 'Players', 'Catalog', 'Control']) {
      expect(
        heads.some((h) => h?.includes(s)),
        s,
      ).toBe(true)
    }
  })
})
