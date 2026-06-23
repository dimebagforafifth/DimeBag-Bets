// @vitest-environment happy-dom
/**
 * The Adjust-figure control must send a DEBIT (negative amount) as negative cents —
 * the bug the Phase-1 review caught was the stake-oriented `toCents` clamping negatives
 * to 0, which silently killed the debit half of the feature at the only UI entry point.
 */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Member } from '../features/org/index.js'
import { AdjustFigure } from '../features/org/ui/Management.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function member(): Member {
  return {
    id: 'p1',
    role: 'player',
    name: 'P',
    parentId: 'm',
    active: true,
    profile: {},
    account: { id: 'p1', creditLimit: 100_000, balance: 0, pending: 0 },
  }
}

/** Drive a React-controlled input: set the value through the native setter + fire input. */
function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('AdjustFigure control', () => {
  it('sends a debit as NEGATIVE cents (not clamped to 0)', () => {
    const calls: Array<[string, number, string]> = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<AdjustFigure member={member()} onAdjust={(id, d, r) => calls.push([id, d, r])} />))

    const amt = host.querySelector('.org-adjust-amt') as HTMLInputElement
    const reason = host.querySelector('.org-adjust-reason') as HTMLInputElement
    const apply = host.querySelector('.org-adjust-apply') as HTMLButtonElement

    expect(apply.disabled).toBe(true) // nothing entered yet
    type(amt, '-50') // a $50 debit
    type(reason, 'correction')
    expect(apply.disabled).toBe(false)
    act(() => apply.click())

    expect(calls).toEqual([['p1', -5000, 'correction']]) // sign preserved

    act(() => root.unmount())
    host.remove()
  })

  it('sends a credit as positive cents', () => {
    const calls: Array<[string, number, string]> = []
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<AdjustFigure member={member()} onAdjust={(id, d, r) => calls.push([id, d, r])} />))

    type(host.querySelector('.org-adjust-amt') as HTMLInputElement, '25')
    type(host.querySelector('.org-adjust-reason') as HTMLInputElement, 'comp')
    act(() => (host.querySelector('.org-adjust-apply') as HTMLButtonElement).click())

    expect(calls).toEqual([['p1', 2500, 'comp']])

    act(() => root.unmount())
    host.remove()
  })
})
