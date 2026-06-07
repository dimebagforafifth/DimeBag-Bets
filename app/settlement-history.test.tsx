// @vitest-environment happy-dom
/**
 * The Settlement History panel renders persisted records and lets the operator flip
 * the mark-paid flag — verifying the Step-7 store → panel wiring end to end.
 */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { settleAndRecord } from './settlement-store.js'
import { SettlementHistory } from './SettlementHistory.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('SettlementHistory panel', () => {
  it('lists a recorded settlement and toggles its collected status', () => {
    settleAndRecord(1_700_000_000_000) // record one settlement into the store

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(<SettlementHistory />))

    const status = () => host.querySelector('.sh-status') as HTMLElement
    expect(status().textContent).toBe('Outstanding')

    const mark = [...host.querySelectorAll<HTMLButtonElement>('.sh-btn')].find(
      (b) => b.textContent === 'Mark collected',
    )!
    act(() => mark.click())

    expect(status().textContent).toBe('Collected') // store update re-rendered the panel

    act(() => root.unmount())
    host.remove()
  })
})
