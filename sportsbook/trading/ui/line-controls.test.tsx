// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TradingDesk } from './TradingDesk.js'
import { SignedNumberInput } from './LineControls.js'
import { getHouseMargin, resetHouseMargin, resetOverlay } from '../../index.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function host(): HTMLDivElement {
  const h = document.createElement('div')
  document.body.appendChild(h)
  return h
}
function typeInto(el: HTMLInputElement, v: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
function clickText(h: HTMLElement, text: string) {
  const b = [...h.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === text)
  if (!b) throw new Error(`no button "${text}"`)
  act(() => b.click())
}

beforeEach(() => {
  resetHouseMargin()
  resetOverlay()
})

describe('SignedNumberInput — typing a negative sign', () => {
  it('lets you type "-" then a negative number without snapping back', () => {
    const h = host()
    const root = createRoot(h)
    const onChange = vi.fn()
    act(() => root.render(<SignedNumberInput value={0} onChange={onChange} ariaLabel="line" />))
    const input = h.querySelector<HTMLInputElement>('input')!

    act(() => typeInto(input, '-')) // intermediate: held, no commit, not reset
    expect(input.value).toBe('-')
    expect(onChange).not.toHaveBeenCalled()

    act(() => typeInto(input, '-3.5')) // full number: commits
    expect(input.value).toBe('-3.5')
    expect(onChange).toHaveBeenLastCalledWith(-3.5)

    act(() => root.unmount())
    h.remove()
  })

  it('rejects letters but keeps a valid negative draft', () => {
    const h = host()
    const root = createRoot(h)
    const onChange = vi.fn()
    act(() => root.render(<SignedNumberInput value={-110} onChange={onChange} allowDecimal={false} ariaLabel="price" />))
    const input = h.querySelector<HTMLInputElement>('input')!
    act(() => typeInto(input, '-150'))
    expect(onChange).toHaveBeenLastCalledWith(-150)
    act(() => typeInto(input, '-15a')) // rejected — draft stays -150
    expect(input.value).toBe('-150')
    act(() => root.unmount())
    h.remove()
  })
})

describe('TradingDesk Lines tab — modes', () => {
  let h: HTMLDivElement
  let root: Root
  const mount = () => {
    h = host()
    root = createRoot(h)
    act(() => root.render(<TradingDesk />))
  }

  it('Simple mode: the house-edge control sets the global hold', () => {
    mount()
    expect(h.textContent).toContain('House edge')
    clickText(h, '6%')
    expect(getHouseMargin()).toBe(0.06)
    act(() => root.unmount())
    h.remove()
  })

  it('switching to Advanced reveals the matrix, auto-rules, alt lines and circling', () => {
    mount()
    expect(h.textContent).not.toContain('Margin matrix') // hidden in Simple
    clickText(h, 'Advanced')
    expect(h.textContent).toContain('Margin matrix')
    expect(h.textContent).toContain('Exposure auto-rules')
    expect(h.textContent).toContain('Alternate lines')
    expect(h.textContent).toContain('Circled players')
    act(() => root.unmount())
    h.remove()
  })
})
