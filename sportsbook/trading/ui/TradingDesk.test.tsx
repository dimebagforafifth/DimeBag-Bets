// @vitest-environment happy-dom
/**
 * The trading desk's Lines tab is the one operator surface that MOVES the player
 * book. This proves the controls drive the shared overlay: rendering lists every
 * event's three markets, and clicking Pull / a vig preset / a line step writes
 * straight to the overlay (which every player store reads). The money-effect of
 * that overlay — a suspended market rejecting a bet — is covered in store.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { TradingDesk } from './TradingDesk.js'
import {
  EVENTS,
  getAdjustment,
  isMarketSuspended,
  resetOverlay,
} from '../../index.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => resetOverlay())
afterEach(() => resetOverlay())

function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(<TradingDesk />))
  return { host, root, teardown: () => { act(() => root.unmount()); host.remove() } }
}
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click())

describe('TradingDesk — Lines tab', () => {
  it('lists every event and its three markets, defaulting to the Lines tab', () => {
    const { host, teardown } = mount()
    expect(host.querySelectorAll('.td-evt').length).toBe(EVENTS.length)
    expect(host.querySelectorAll('.td-mkt').length).toBe(EVENTS.length * 3)
    teardown()
  })

  it('Pull suspends that market in the shared overlay (what players read)', () => {
    const { host, teardown } = mount()
    const firstEvent = EVENTS[0].id
    // first market row is the moneyline; its Pull button
    const pull = host.querySelector('.td-mkt .td-mkt-actions .td-pull')
    expect(isMarketSuspended(firstEvent, 'moneyline')).toBe(false)
    click(pull)
    expect(isMarketSuspended(firstEvent, 'moneyline')).toBe(true)
    // the button now reflects the pulled state
    expect(host.querySelector('.td-mkt .td-mkt-actions .td-pull')?.textContent).toBe('Pulled')
    teardown()
  })

  it('a vig preset sets the market margin in the overlay', () => {
    const { host, teardown } = mount()
    const firstEvent = EVENTS[0].id
    const vig = host.querySelector('.td-mkt .td-vig .td-vigbtn') // the 2.0% preset
    click(vig)
    expect(getAdjustment(firstEvent, 'moneyline')?.margin).toBe(0.02)
    teardown()
  })

  it('a line step moves the spread and updates the displayed number', () => {
    const { host, teardown } = mount()
    const firstEvent = EVENTS[0].id
    const raise = host.querySelector('button[aria-label="Raise the spread line"]')
    click(raise)
    expect(getAdjustment(firstEvent, 'spread')?.lineShift).toBe(0.5)
    // base home spread is −3.5 → +0.5 step shows −3
    const spreadRow = host.querySelectorAll('.td-mkt')[1] // moneyline, SPREAD, total
    expect(spreadRow.querySelector('.td-line-val')?.textContent).toBe('-3')
    teardown()
  })
})
