// @vitest-environment happy-dom
/**
 * The book UI: chips show `priceDisplay` (never the raw feed price), tapping one adds
 * it to the slip, placing it routes through `core` (holds pending + shows in activity),
 * and the live-activity panel is role-scoped (a player sees only their own).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BookView } from './BookView.js'
import { getBook } from '../book-store.js'
import { resetBookOdds, getBookOddsSnapshot } from './odds-source.js'
import { __resetBets } from './bets-store.js'
import { __resetPlacement, placeBookBet } from './placement.js'
import { legFromSelection } from './slip.js'
import { formatAmerican } from './odds-format.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root

beforeEach(() => {
  __resetBets()
  __resetPlacement()
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

function renderAs(playerId: string, role: 'manager' | 'player', viewerId: string) {
  const m = getBook().members[playerId]
  act(() =>
    root.render(
      <BookView account={m.account} playerName={m.name} role={role} viewerId={viewerId} />,
    ),
  )
}
const chips = () => [...host.querySelectorAll<HTMLButtonElement>('.bk-chip')]
const click = (el: Element) => act(() => (el as HTMLElement).click())

describe('market rendering', () => {
  it('a chip shows the displayed price, not the raw feed price', () => {
    renderAs('p-marco', 'manager', 'mgr')
    const ev0 = getBookOddsSnapshot().events[0] // the live game renders first
    const mlHome = ev0.markets.find((m) => m.type === 'moneyline')!.selections[0]
    const first = chips()[0]
    expect(first.querySelector('.bk-chip-price')?.textContent).toBe(
      formatAmerican(mlHome.priceDisplay.american),
    )
    // the raw price must NOT leak into the chip
    expect(first.textContent).not.toContain(String(Math.abs(mlHome.priceRaw.american)))
  })

  it('tapping a chip adds it to the slip', () => {
    renderAs('p-marco', 'manager', 'mgr')
    click(chips()[0]) // Lakers moneyline
    expect(host.querySelector('.bk-slip')?.textContent).toContain('Lakers')
  })
})

describe('placing a bet', () => {
  it('places through core (holds pending) and shows in activity', () => {
    renderAs('p-marco', 'manager', 'mgr')
    const a = getBook().members['p-marco'].account
    click(chips()[0]) // add a leg
    click(host.querySelector('.bk-quick')!) // first quick stake = $10
    click(host.querySelector('.bk-place')!) // Place bet
    expect(a.pending).toBe(1_000) // $10 held
    expect(host.querySelector('.bk-panel')?.textContent).toContain('Lakers')
  })
})

describe('role-scoped activity', () => {
  it('a player sees only their own bets', () => {
    // a manager-placed bet on Marco
    const marco = getBook().members['p-marco']
    const ev = getBookOddsSnapshot().events[0]
    const leg = legFromSelection(ev, ev.markets[0], ev.markets[0].selections[0])
    placeBookBet({
      account: marco.account,
      playerName: 'Marco',
      placedBy: 'Marco',
      legs: [leg],
      mode: 'single',
      stakeCents: 2_000,
      now: 1,
    })

    // Lena's own book is empty — she doesn't see Marco's action
    renderAs('p-lena', 'player', 'p-lena')
    const panel = host.querySelector('.bk-panel')!
    expect(panel.textContent).toContain('My bets')
    expect(panel.textContent).toContain('No bets')
  })
})
