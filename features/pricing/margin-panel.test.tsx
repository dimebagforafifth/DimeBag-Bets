// @vitest-environment happy-dom
/**
 * The margin console tile: posture presets + base + per-market overrides write the live
 * `lib/odds` margin config, which the poller reads to reprice. Renders fully populated from
 * the default (byte-identical) config.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MarginPanel } from './MarginPanel.js'
import { pricingManifests } from './manifest.js'
import {
  getMarginConfig,
  MARGIN_POSTURES,
  DEFAULT_MARGIN,
  __resetMarginConfig,
} from '../../lib/odds/index.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetMarginConfig()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  __resetMarginConfig()
})

const rateInputs = () => [...host.querySelectorAll<HTMLInputElement>('.feat-grid input')]
function blurWith(el: HTMLInputElement, v: string) {
  el.value = v
  act(() => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
}

describe('manifest', () => {
  it('registers a control-section margin tile', () => {
    expect(pricingManifests[0]).toMatchObject({ key: 'margin-pricing', section: 'control' })
  })
})

describe('MarginPanel', () => {
  it('renders the three posture presets, with Balanced active by default', () => {
    act(() => root.render(<MarginPanel onBack={() => {}} />))
    const postures = [...host.querySelectorAll('button')].map((b) => b.textContent)
    expect(postures).toEqual(expect.arrayContaining(['Recreational', 'Balanced', 'Sharp']))
    const active = host.querySelector('button[aria-pressed="true"]')
    expect(active?.textContent).toBe('Balanced')
  })

  it('applying a posture writes the live config', () => {
    act(() => root.render(<MarginPanel onBack={() => {}} />))
    const recreational = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Recreational',
    )!
    act(() => recreational.click())
    expect(getMarginConfig()).toEqual(MARGIN_POSTURES.recreational)
    expect(host.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Recreational')
  })

  it('editing the base margin + a per-market override updates the config', () => {
    act(() => root.render(<MarginPanel onBack={() => {}} />))
    // [0] base, then moneyline / spread / total / prop overrides. Re-query after each commit:
    // the card is keyed by version, so it remounts to resync (the SettingsPanel pattern).
    expect(rateInputs().length).toBe(5)
    expect(getMarginConfig().base).toBe(DEFAULT_MARGIN)

    blurWith(rateInputs()[0], '6') // base → 6%
    expect(getMarginConfig().base).toBeCloseTo(0.06, 10)

    blurWith(rateInputs()[4], '12') // prop override → 12%
    expect(getMarginConfig().perMarket?.prop).toBeCloseTo(0.12, 10)
  })
})
