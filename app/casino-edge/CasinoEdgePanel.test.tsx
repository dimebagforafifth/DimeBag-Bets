// @vitest-environment happy-dom
/** The Casino Edge panel renders per-game band rows (incl. bet-type sub-rows) and edits an edge,
 *  clamped to the band. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CasinoEdgePanel } from './CasinoEdgePanel.js'
import { __resetEdgeBands, currentEdgeBps, setEdgeBps } from './edge-bands-store.js'
import { resetRtp } from '../edge-store.js'
import { edgeToBps } from '../game-edge-config.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetEdgeBands()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  __resetEdgeBands()
  resetRtp('dice')
})

const render = () => act(() => root.render(<CasinoEdgePanel />))

describe('CasinoEdgePanel', () => {
  it('lists banded games with their RTP/edge readout', () => {
    render()
    expect(host.textContent).toContain('Casino Edge')
    expect(host.textContent).toContain('Blackjack')
    expect(host.textContent).toContain('Keno')
    expect(host.textContent).toMatch(/% RTP/)
    // sic bo exposes its per-bet-type sub-rows
    expect(host.textContent).toMatch(/Triple/)
  })

  it('moving a slider sets the edge, clamped into the band', () => {
    render()
    const range = host.querySelector('input[type="range"]') as HTMLInputElement
    expect(range).toBeTruthy()
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!
      setter.call(range, String(range.max)) // push to the band ceiling
      range.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // the first row is the first game alphabetically; its current edge is now at its ceiling
    expect(Number(range.value)).toBe(Number(range.max))
  })

  it('clamps an adjustable game’s edge to its band ceiling via the store', () => {
    setEdgeBps('dice', edgeToBps(0.5)) // 50% → dice ceiling 5%
    expect(currentEdgeBps('dice')).toBe(500)
  })
})
