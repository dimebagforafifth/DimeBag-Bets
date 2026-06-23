// @vitest-environment happy-dom
/**
 * The Pick'em section: the board renders projections off the odds feed, tapping
 * Higher/Lower builds an entry, and submitting holds the stake through `core` and shows it
 * in "my entries". Credits/balance only.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PickemSection } from './PickemSection.js'
import { getBook } from '../../../app/book-store.js'
import { resetBookOdds } from '../../../app/book/odds-source.js'
import { __resetEntries } from '../entries.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root

beforeEach(() => {
  __resetEntries()
  resetBookOdds()
  for (const m of Object.values(getBook().members)) m.account.pending = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(playerId = 'p-marco') {
  const m = getBook().members[playerId]
  act(() => root.render(<PickemSection account={m.account} playerName={m.name} />))
  return m
}
const higherButtons = () => [...host.querySelectorAll<HTMLButtonElement>('.pk-higher')]
const click = (el: Element) => act(() => (el as HTMLElement).click())

describe('board rendering', () => {
  it('renders projection rows from the feed + seeded board', () => {
    render()
    const rows = host.querySelectorAll('.pk-proj')
    // 5 feed props (mockSlate) + 11 seeded = 16
    expect(rows.length).toBe(16)
    // grouped by game
    expect(host.querySelectorAll('.pk-game').length).toBeGreaterThanOrEqual(2)
  })

  it('tapping Higher selects the projection and shows it in the slip', () => {
    render()
    click(higherButtons()[0])
    expect(host.querySelector('.pk-pick.is-on')).not.toBeNull()
    expect(host.querySelector('.pk-slip')?.textContent).toContain('Higher')
  })
})

describe('submitting an entry', () => {
  it('holds the stake through core and lists it in my entries', () => {
    const m = render()
    const a = m.account
    click(higherButtons()[0]) // pick 1
    click(higherButtons()[1]) // pick 2 (distinct projection)
    click(host.querySelector('.pk-quick')!) // first quick stake = $5
    expect(host.querySelector('.pk-submit')).not.toBeNull()
    click(host.querySelector('.pk-submit')!)
    expect(a.pending).toBe(500) // $5 held through core
    expect(host.querySelector('.pk-entry')?.textContent).toContain('2 picks')
  })
})
