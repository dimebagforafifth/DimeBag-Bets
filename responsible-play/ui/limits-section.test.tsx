// @vitest-environment happy-dom
/** The player "Limits & Activity" section — the stat sheet renders and setting a cap flows
 *  through the store into core's gate (no parallel money path). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { getEffectiveLimits } from '../../core/index.js'
import { toCents } from '../../games/shared/money.js'
import { __resetResponsiblePlay } from '../index.js'
import { LimitsActivitySection, responsiblePlaySection } from './LimitsActivitySection.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetResponsiblePlay()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  __resetResponsiblePlay()
})

const q = <T extends Element = Element>(s: string) => host.querySelector<T>(s)
const btnByText = (text: string): HTMLButtonElement =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => (b.textContent ?? '').trim() === text,
  )!
function setValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  act(() => el.dispatchEvent(new Event('input', { bubbles: true })))
}

describe('LimitsActivitySection', () => {
  it('descriptor targets the player section', () => {
    expect(responsiblePlaySection).toMatchObject({ id: 'limits', roles: ['player'] })
  })

  it('renders the stat sheet + limit controls', () => {
    act(() => root.render(<LimitsActivitySection playerId="p-x" playerName="Pat" />))
    expect(host.textContent).toMatch(/My stat sheet/)
    expect(host.textContent).toMatch(/Wager limit/)
    expect(host.textContent).toMatch(/Loss limit/)
    expect(host.textContent).toMatch(/Cool-off/)
    expect(host.textContent).toMatch(/Session reminder/)
    // No graded bets yet for this player → the empty-window note shows.
    expect(host.textContent).toMatch(/No graded bets/)
  })

  it('setting a wager cap flows into core’s effective limit', () => {
    act(() => root.render(<LimitsActivitySection playerId="p-x" playerName="Pat" />))
    const amount = q<HTMLInputElement>('input[aria-label="Wager limit amount"]')!
    setValue(amount, '150')
    act(() => btnByText('Set').click()) // first "Set" is the wager control
    expect(getEffectiveLimits('p-x').wager?.amountCents).toBe(toCents(150))
    expect(host.textContent).toMatch(/Limit applied/)
  })

  it('setting a session reminder arms the nudge (soft, immediate)', () => {
    act(() => root.render(<LimitsActivitySection playerId="p-x" playerName="Pat" />))
    const mins = q<HTMLInputElement>('input[aria-label="Session reminder minutes"]')!
    setValue(mins, '45')
    // The session control's Set is the third "Set" button (wager, loss, session).
    const setButtons = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(
      (b) => (b.textContent ?? '').trim() === 'Set',
    )
    act(() => setButtons[setButtons.length - 1].click())
    expect(getEffectiveLimits('p-x').session?.amountCents).toBe(45)
    expect(host.textContent).toMatch(/every 45 min/)
  })

  it('a cool-off needs a confirm and then shows the active banner', () => {
    act(() => root.render(<LimitsActivitySection playerId="p-x" playerName="Pat" />))
    act(() => btnByText('Start cool-off…').click())
    act(() => btnByText('Confirm').click())
    expect(getEffectiveLimits('p-x').cooloff?.until).toBeGreaterThan(Date.now())
    expect(host.textContent).toMatch(/Cool-off active/)
  })
})
