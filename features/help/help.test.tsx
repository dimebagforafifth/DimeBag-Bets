// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ManualPanel } from './ManualPanel.js'
import { operatorManualManifests } from './manifest.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
const body = () => host.querySelector('.mdsk-manual-body')?.textContent ?? ''
const toc = () => [...host.querySelectorAll<HTMLButtonElement>('.mdsk-manual-toc button')]

describe('Operator Manual', () => {
  it('manifest targets Control with a non-colliding key', () => {
    const m = operatorManualManifests[0]
    expect(m.key).toBe('operator-manual')
    expect(m.section).toBe('control')
    expect(m.Panel).toBe(ManualPanel)
  })

  it('renders the first chapter and switches chapters from the table of contents', () => {
    act(() => root.render(<ManualPanel onBack={() => {}} />))
    // A multi-chapter TOC, with the overview shown first.
    expect(toc().length).toBeGreaterThanOrEqual(8)
    expect(body()).toMatch(/four sections/i)

    // Switch to the Cashier chapter.
    const cashier = toc().find((b) => b.textContent === 'Cashier')!
    act(() => cashier.click())
    expect(body()).toMatch(/Grant/)
    expect(cashier.className).toContain('is-on')

    // And to the tile tour.
    const tour = toc().find((b) => b.textContent === 'Tour of the tiles')!
    act(() => tour.click())
    expect(body()).toMatch(/Sportsbook Lines/)
  })
})
