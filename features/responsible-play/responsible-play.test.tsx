// @vitest-environment happy-dom
/** Responsible Play operator tile — manifest shape, empty state, and a read-only roster that
 *  reflects a player's self-set limit (no control here mutates a limit). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { getBook } from '../../app/book-store.js'
import { formatMoney } from '../../games/shared/money.js'
import { __resetResponsiblePlay, setLimit } from '../../responsible-play/index.js'
import { responsiblePlayManifests } from './manifest.js'
import { ResponsiblePlayConsole } from './ResponsiblePlayConsole.js'
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

describe('Responsible Play — operator tile', () => {
  it('manifest targets the Players section, read-only panel', () => {
    const m = responsiblePlayManifests[0]
    expect(m.key).toBe('responsible-play')
    expect(m.section).toBe('players')
    expect(m.Panel).toBe(ResponsiblePlayConsole)
  })

  it('shows the empty state when nobody has set a limit', () => {
    act(() => root.render(<ResponsiblePlayConsole onBack={() => {}} />))
    expect(host.textContent).toMatch(/No players have set a self-limit/)
  })

  it('lists a player and their cap once they self-set one (read-only)', () => {
    const player = Object.values(getBook().members).find((m) => m.role === 'player')!
    setLimit(player.id, { kind: 'wager', period: 'day', amountCents: 12_345 })

    act(() => root.render(<ResponsiblePlayConsole onBack={() => {}} />))
    expect(host.textContent).toContain(player.name)
    expect(host.textContent).toContain(formatMoney(12_345)) // the cap is shown
    // It's an oversight view — there are no limit-editing controls (only the Back button).
    const actionButtons = [...host.querySelectorAll('button')].filter(
      (b) => !/back/i.test(b.textContent ?? ''),
    )
    expect(actionButtons.length).toBe(0)
  })
})
