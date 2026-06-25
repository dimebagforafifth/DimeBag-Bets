// @vitest-environment happy-dom
/**
 * The header wallet (CLAUDE.md §3, presentation): lead with BALANCE — what the
 * player can actually bet right now (availableToWager) — and show the week's
 * win/loss standing ("This week", the core `balance`) as a plain ▲/▼/even, not
 * signed jargon. This locks that ordering and the down-tone for a player in the
 * red, so the always-visible figure reads simply.
 */

import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { availableToWager } from '../core/index.js'
import { App } from './App.js'
import { getCurrentPlayer, setCurrentPlayer } from './book-store.js'
import { formatMoney } from '../games/shared/money.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(<App />))
  return { host, root }
}
// The header wallet is now the brand WalletPill (components/brand): same data +
// ordering, with .sds-wallet__label / .sds-wallet__value class hooks.
function labels(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.sds-wallet__label')].map((n) => n.textContent ?? '')
}
function values(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('.sds-wallet__value')]
}

describe('header wallet', () => {
  it('leads with Balance (availableToWager), then This week (the figure)', () => {
    const { host, root } = mount()
    const acct = getCurrentPlayer()!.account

    expect(labels(host)).toEqual(['Balance', 'This week'])
    // Headline number = what you can bet right now.
    expect(values(host)[0].textContent).toBe(formatMoney(availableToWager(acct)))

    act(() => root.unmount())
    host.remove()
  })

  it('shows a player in the red as ▼ down, in the black as ▲ up', () => {
    const { host, root } = mount()

    // Marco is the first seeded player and is down (−$450).
    const down = getCurrentPlayer()!.account
    expect(down.balance).toBeLessThan(0)
    const week = () => values(host)[1]
    expect(week().textContent).toBe(`▼ ${formatMoney(Math.abs(down.balance))}`)
    expect(week().className).toContain('is-down')

    // Switch to a player who is up (Dana, +$2,100) — should read ▲ and green.
    act(() => setCurrentPlayer('p-dana'))
    const up = getCurrentPlayer()!.account
    expect(up.balance).toBeGreaterThan(0)
    expect(week().textContent).toBe(`▲ ${formatMoney(up.balance)}`)
    expect(week().className).toContain('is-up')

    act(() => root.unmount())
    host.remove()
  })
})
