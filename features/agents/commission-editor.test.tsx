// @vitest-environment happy-dom
/**
 * The per-member commission panel: the manager picks a model + rate and it writes through
 * the org setter (inside mutateBook). No money moves here — settlement grades it later.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CommissionEditor } from './CommissionEditor.js'
import { getBook } from '../../app/book-store.js'
import { commissionConfigOf } from '../../org/index.js'
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

function setValue(el: HTMLInputElement | HTMLSelectElement, v: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v)
  act(() => el.dispatchEvent(new Event('input', { bubbles: true })))
  act(() => el.dispatchEvent(new Event('change', { bubbles: true })))
}

describe('CommissionEditor', () => {
  it('shows the seeded model and switches it to split through the book setter', () => {
    const member = getBook().members['a-e'] // East Desk — seeded profit-share 20%
    act(() => root.render(<CommissionEditor member={member} />))

    const select = host.querySelector<HTMLSelectElement>('select')!
    expect(select.value).toBe('profit_share')
    const labels = [...select.querySelectorAll('option')].map((o) => o.value)
    expect(labels).toEqual(['', 'split', 'profit_share', 'redline'])

    setValue(select, 'split')
    const pctInput = host.querySelector<HTMLInputElement>('input[type="number"]')!
    setValue(pctInput, '15')
    act(() => host.querySelector<HTMLButtonElement>('.feat-btn')!.click())

    expect(commissionConfigOf(getBook().members['a-e'])).toMatchObject({ model: 'split', pct: 15 })
    expect(host.querySelector('.feat-saved')?.textContent).toMatch(/updated/i)
  })

  it('surfaces a redline make-up carryover for a desk in the red', () => {
    const member = getBook().members['a-w'] // West Desk — seeded redline with a red figure
    act(() => root.render(<CommissionEditor member={member} />))
    expect(host.textContent).toMatch(/red figure/i)
  })

  it('clearing the model (None) removes the split', () => {
    const member = getBook().members['sa-n'] // North Region — seeded split 15%
    act(() => root.render(<CommissionEditor member={member} />))
    setValue(host.querySelector<HTMLSelectElement>('select')!, '')
    act(() => host.querySelector<HTMLButtonElement>('.feat-btn')!.click())
    expect(commissionConfigOf(getBook().members['sa-n'])).toBeNull()
  })
})
