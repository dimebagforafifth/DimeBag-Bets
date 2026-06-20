// @vitest-environment happy-dom
/**
 * The BetBuilder UI end-to-end: it groups one game's markets, adds legs, proactively greys
 * out a contradictory pick, shows the correlated SGP price, and PLACES through core (the bet
 * lands in the activity store). A UX layer over the existing engine — no new money path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Account } from '../../core/index.js'
import type { NormalizedEvent, NormalizedMarket, Price, Selection } from '../../lib/odds/contract.js'
import { BetBuilder } from './BetBuilder.js'
import { getBets, __resetBets } from './bets-store.js'
import { settleBookBet, __resetPlacement } from './placement.js'
import { parlayPrice } from './slip.js'
import { suspendMarket, __resetRiskControls } from '../risk-controls.js'
import { __resetLimits } from '../../trading/limits.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const P = (american: number, decimal: number): Price => ({ american, decimal })
const sel = (selectionId: string, side: string, line: number | undefined, am: number, dec: number): Selection => ({
  selectionId,
  side,
  ...(line === undefined ? {} : { line }),
  priceRaw: P(am, dec),
  priceDisplay: P(am, dec),
  bookmaker: 'mock',
  available: true,
})
const mkt = (
  marketId: string,
  type: NormalizedMarket['type'],
  selections: Selection[],
  extra: Partial<NormalizedMarket> = {},
): NormalizedMarket => ({ marketId, type, period: 'game', selections, ...extra })

const EVENT: NormalizedEvent = {
  eventId: 'ev1',
  leagueId: 'NBA',
  sport: 'BASKETBALL',
  home: 'Lakers',
  away: 'Celtics',
  startsAt: '2026-07-01T00:00:00Z',
  status: 'pre',
  markets: [
    mkt('ev1:moneyline:game', 'moneyline', [
      sel('ml-home', 'home', undefined, -130, 1.77),
      sel('ml-away', 'away', undefined, 110, 2.1),
    ]),
    mkt('ev1:total:game', 'total', [
      sel('tot-over', 'over', 220.5, -110, 1.91),
      sel('tot-under', 'under', 220.5, -110, 1.91),
    ]),
  ],
}

let host: HTMLElement
let root: Root
let placed = 0

beforeEach(() => {
  __resetBets()
  __resetPlacement()
  __resetRiskControls()
  __resetLimits()
  placed = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(account: Account) {
  act(() =>
    root.render(
      <BetBuilder
        event={EVENT}
        account={account}
        playerName="Tester"
        onBack={() => {}}
        onPlaced={() => {
          placed += 1
        }}
      />,
    ),
  )
}
const newAccount = (): Account => ({ id: 'p-test', creditLimit: 100_000, balance: 0, pending: 0 })
const chips = () => [...host.querySelectorAll<HTMLButtonElement>('.bk-chip')]
const chipFor = (label: string) =>
  chips().find((c) => c.querySelector('.bk-chip-pick')?.textContent === label)!
const click = (el: Element) => act(() => (el as HTMLElement).click())

describe('BetBuilder', () => {
  it('lays out the game markets as builder groups', () => {
    render(newAccount())
    expect(host.textContent).toContain('Moneyline')
    expect(host.textContent).toContain('Total')
    expect(host.textContent).toContain('Build a bet · one game')
  })

  it('adds a leg, then combines two legs into a correlated SGP price', () => {
    render(newAccount())
    click(chipFor('Lakers'))
    expect(host.querySelector('.bk-slip-count')?.textContent).toBe('1')
    expect(host.textContent).toContain('Lakers') // leg on the ticket

    click(chipFor('O 220.5'))
    expect(host.querySelector('.bk-slip-count')?.textContent).toBe('2')
    expect(host.textContent).toContain('Same-game parlay') // SGP badge
    expect(host.textContent).toContain('SGP odds')
  })

  it('greys out the contradictory opposing side once a total is chosen', () => {
    render(newAccount())
    click(chipFor('O 220.5'))
    expect(chipFor('U 220.5').classList.contains('is-blocked')).toBe(true)
    // clicking the blocked pick does not add it (still one leg)
    click(chipFor('U 220.5'))
    expect(host.querySelector('.bk-slip-count')?.textContent).toBe('1')
  })

  it('places the built ticket through core', () => {
    const account = newAccount()
    render(account)
    click(chipFor('Lakers'))
    click(chipFor('O 220.5'))
    click(host.querySelectorAll<HTMLButtonElement>('.bk-quick')[0]) // first quick stake = $10 (1,000¢)
    click(host.querySelector('.bk-place')!)

    expect(getBets()).toHaveLength(1)
    const bet = getBets()[0]
    expect(bet.legs).toHaveLength(2)
    expect(bet.status).toBe('open')
    expect(account.pending).toBe(1_000)
    expect(placed).toBe(1)
  })

  it('settles a built SGP at the stored CORRELATED price, not the naive product', () => {
    const account = newAccount()
    render(account)
    click(chipFor('Lakers'))
    click(chipFor('O 220.5'))
    click(host.querySelectorAll<HTMLButtonElement>('.bk-quick')[0]) // $10 (1,000¢)
    click(host.querySelector('.bk-place')!)

    const bet = getBets()[0]
    // the SGP correlated price is shorter than the independent product (cross-axis → shorten)
    expect(bet.decimal).toBeLessThanOrEqual(parlayPrice(bet.legs) + 1e-3)
    // settle both legs as wins → the figure moves by the STORED SGP decimal, proving it flows through core
    const before = account.balance
    settleBookBet(bet.id, {}, Date.now())
    expect(getBets()[0].status).toBe('won')
    expect(account.pending).toBe(0)
    expect(account.balance).toBe(before + Math.round(1_000 * (bet.decimal - 1)))
  })

  it('refuses to place a built ticket whose leg the desk suspends', () => {
    const account = newAccount()
    render(account)
    click(chipFor('Lakers'))
    click(host.querySelectorAll<HTMLButtonElement>('.bk-quick')[0])
    suspendMarket('moneyline') // suspended after the leg is on the ticket
    click(host.querySelector('.bk-place')!) // placement re-validates through the gate

    expect(getBets()).toHaveLength(0) // nothing placed
    expect(account.pending).toBe(0)
    expect(host.textContent).toContain('suspended')
  })
})
