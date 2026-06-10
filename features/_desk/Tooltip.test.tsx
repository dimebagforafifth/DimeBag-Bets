// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Tooltip, InfoDot } from './Tooltip.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  vi.useFakeTimers()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const tip = () => host.querySelector('.mdsk-tip')
const wrap = () => host.querySelector('.mdsk-tip-wrap') as HTMLElement

describe('delayed tooltip', () => {
  // React simulates onPointerEnter/Leave from delegated pointerover/pointerout.
  const hoverOn = () => act(() => wrap().dispatchEvent(new Event('pointerover', { bubbles: true })))
  const hoverOff = () => act(() => wrap().dispatchEvent(new Event('pointerout', { bubbles: true })))

  it('does NOT pop up the instant you hover — only after the delay', () => {
    act(() => root.render(<Tooltip tip="Definition" delay={450}><span>x</span></Tooltip>))
    hoverOn()
    expect(tip()).toBeNull() // nothing yet
    act(() => vi.advanceTimersByTime(200))
    expect(tip()).toBeNull() // still inside the delay window
    act(() => vi.advanceTimersByTime(300))
    expect(tip()?.textContent).toContain('Definition') // now it shows
  })

  it('cancels the pending tooltip if the pointer leaves before the delay elapses', () => {
    act(() => root.render(<Tooltip tip="Definition"><span>x</span></Tooltip>))
    hoverOn()
    act(() => vi.advanceTimersByTime(200)) // still pending
    hoverOff()
    act(() => vi.advanceTimersByTime(600))
    expect(tip()).toBeNull() // never appeared
  })

  it('opens immediately on keyboard focus and shows the glossary entry', () => {
    act(() => root.render(<InfoDot id="figure" />))
    const btn = host.querySelector('.mdsk-info') as HTMLButtonElement
    act(() => btn.dispatchEvent(new FocusEvent('focusin', { bubbles: true })))
    expect(tip()?.textContent).toMatch(/Figure/) // no delay needed for keyboard
  })

  it('dismisses shortly after blur', () => {
    act(() => root.render(<InfoDot id="settle" />))
    const btn = host.querySelector('.mdsk-info') as HTMLButtonElement
    act(() => btn.dispatchEvent(new FocusEvent('focusin', { bubbles: true })))
    expect(tip()).not.toBeNull()
    act(() => btn.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    act(() => vi.advanceTimersByTime(200))
    expect(tip()).toBeNull()
  })
})
