// @vitest-environment happy-dom
/** The SGP Rules panel renders the immutable block matrix and edits strictness + leg cap. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SgpRulesPanel } from './SgpRulesPanel.js'
import { __resetSgpRules, currentStrictnessConfig } from './sgp-rules.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetSgpRules()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  __resetSgpRules()
})

const render = () => act(() => root.render(<SgpRulesPanel />))
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))

describe('SgpRulesPanel', () => {
  it('shows the immutable hard-block matrix', () => {
    render()
    expect(host.textContent).toContain('SGP Rules')
    expect(host.querySelectorAll('.sgpr-matrix tr').length).toBeGreaterThanOrEqual(5)
    expect(host.textContent).toMatch(/always on/i)
  })

  it('switches strictness and resets the leg cap', () => {
    render()
    const strict = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Strict')!
    click(strict)
    expect(currentStrictnessConfig().strictness).toBe('strict')
    expect(currentStrictnessConfig().max_legs).toBe(6)
    expect(currentStrictnessConfig().block_contradictions).toBe(true)
  })

  it('steps the max-leg cap within the hard ceiling', () => {
    render()
    const minus = host.querySelector('button[aria-label="fewer legs"]')!
    click(minus)
    expect(currentStrictnessConfig().max_legs).toBe(9)
  })
})
