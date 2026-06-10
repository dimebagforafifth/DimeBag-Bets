// @vitest-environment happy-dom
/**
 * The console shell: renders cleanly against an EMPTY registry (graceful empty
 * state), is fully prop-driven (no hardcoded brand/username/figures), renders the
 * four sections in order, and a tile click mounts that feature's Panel in the
 * workspace with a working "All apps" back control.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Circle as Dot } from 'lucide-react'
import { Console } from './Console.js'
import type { FeatureManifest } from '../registry/types.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const mkPanel = (body: string) =>
  function Panel({ onBack }: { onBack: () => void }) {
    return (
      <div className="test-panel">
        <span>{body}</span>
        <button className="panel-internal-back" onClick={onBack}>
          done
        </button>
      </div>
    )
  }

// Deliberately out of section order, to prove the grid re-orders them.
const FAKE: FeatureManifest[] = [
  {
    key: 'risk-flags',
    name: 'Risk Flags',
    hint: 'exposure alerts',
    section: 'control',
    icon: Dot,
    Panel: mkPanel('RISK BODY'),
  },
  {
    key: 'weekly-figures',
    name: 'Weekly Figures',
    hint: 'the running figure',
    section: 'operations',
    icon: Dot,
    Panel: mkPanel('WEEK BODY'),
  },
  {
    key: 'player-list',
    name: 'Players',
    hint: 'every account',
    section: 'players',
    icon: Dot,
    Panel: mkPanel('PLAYERS BODY'),
  },
]

let host: HTMLElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})
const render = (node: React.ReactNode) => act(() => root.render(node))
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click())
const sectionHeads = () => [...host.querySelectorAll('.c-section-head')].map((n) => n.textContent)

describe('Console — empty registry', () => {
  it('renders the chrome + a graceful empty state, with no tiles or dummy data', () => {
    render(<Console registry={[]} />) // explicit empty: the default REGISTRY is populated post-integration
    expect(host.querySelector('.console')).not.toBeNull()
    expect(host.querySelector('.c-topbar')).not.toBeNull()
    expect(host.querySelector('.c-figures')).not.toBeNull()
    expect(host.querySelector('.c-grid-empty')).not.toBeNull() // graceful empty state
    expect(host.querySelectorAll('.c-tile')).toHaveLength(0)
    // no hardcoded brand/username/figures leaked in
    expect(host.textContent).not.toMatch(/JZZYMA/i)
    expect(host.querySelector('.c-brand')?.textContent).toBe('Console') // sane default
  })
})

describe('Console — prop-driven chrome', () => {
  it('shows the passed brand, username and figures (with trend tint)', () => {
    render(
      <Console
        brand="DimeBag"
        username="A. Operator"
        balance="$12,400.00"
        week="+$1,200.00"
        weekTrend="up"
        today="-$340.00"
        todayTrend="down"
        activeAccts={37}
      />,
    )
    expect(host.querySelector('.c-brand')?.textContent).toBe('DimeBag')
    expect(host.querySelector('.c-user')?.textContent).toBe('A. Operator')
    expect(host.textContent).toContain('$12,400.00')
    expect(host.textContent).toContain('37')
    const values = [...host.querySelectorAll('.c-figure-value')]
    expect(
      values.some((v) => v.classList.contains('is-up') && /\+\$1,200/.test(v.textContent ?? '')),
    ).toBe(true)
    expect(
      values.some((v) => v.classList.contains('is-down') && /-\$340/.test(v.textContent ?? '')),
    ).toBe(true)
  })
})

describe('Console — grid + workspace', () => {
  it('renders present sections in order and mounts/unmounts a feature panel', () => {
    render(<Console registry={FAKE} />)
    // Operations, Players, Control — in order; Catalog absent (no items)
    expect(sectionHeads()).toEqual(['Operations', 'Players', 'Control'])
    expect(host.querySelectorAll('.c-tile')).toHaveLength(3)

    // a tile shows its manifest name + hint
    const weekTile = [...host.querySelectorAll<HTMLElement>('.c-tile')].find((t) =>
      /Weekly Figures/.test(t.textContent ?? ''),
    )!
    expect(weekTile.textContent).toContain('the running figure')
    expect(weekTile.tagName).toBe('BUTTON') // keyboard-operable by nature

    // click it → the workspace mounts its Panel (only its body), grid gone
    click(weekTile)
    expect(host.querySelector('.c-workspace')).not.toBeNull()
    expect(host.querySelector('.test-panel')?.textContent).toContain('WEEK BODY')
    expect(host.querySelector('.c-grid')).toBeNull()
    expect(host.querySelector('.c-back')?.textContent).toMatch(/All apps/)

    // back via the shell control → grid returns
    click(host.querySelector('.c-back'))
    expect(host.querySelector('.c-workspace')).toBeNull()
    expect(host.querySelectorAll('.c-tile')).toHaveLength(3)
  })

  it('lets the Panel close itself via its onBack', () => {
    render(<Console registry={FAKE} />)
    click(
      [...host.querySelectorAll<HTMLElement>('.c-tile')].find((t) =>
        /Risk Flags/.test(t.textContent ?? ''),
      ),
    )
    expect(host.querySelector('.test-panel')?.textContent).toContain('RISK BODY')
    click(host.querySelector('.panel-internal-back')) // the Panel's own onBack
    expect(host.querySelector('.c-workspace')).toBeNull()
    expect(host.querySelector('.c-grid')).not.toBeNull()
  })

  it('filters the grid from the search box', () => {
    render(<Console registry={FAKE} />)
    const input = host.querySelector('.c-search-input') as HTMLInputElement
    const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setVal.call(input, 'weekly')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const names = [...host.querySelectorAll('.c-tile-name')].map((n) => n.textContent)
    expect(names).toEqual(['Weekly Figures'])
  })
})
