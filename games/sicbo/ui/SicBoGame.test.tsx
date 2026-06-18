// @vitest-environment happy-dom
/**
 * Render + interaction tests for the Stake-style Sic Bo table. The board lays out
 * every bet region (the four even-money specials incl. Odd/Even, singles, totals,
 * the 15 two-dice combinations, doubles, triples), and the chip-board affordances
 * that move real points — drop / stack / Undo / Double / right-click-clear and the
 * over-limit safety rail — are each exercised. Outcome is seed-random, so a roll
 * asserts the FLOW (figure moved, nothing stranded), not a specific win/loss.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Account } from '../../../core/index.js'
import { SicBoGame } from './SicBoGame.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The roll now mints its server seed from the fairness authority. Force the in-process (local)
// authority so the test never opens a real socket (happy-dom's fetch would ECONNREFUSED as a
// macrotask fake timers can't flush) — the mint becomes deterministic pure-microtask work.
vi.mock('../../shared/fair.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/fair.js')>()
  return {
    ...actual,
    fairnessClient: actual.createFairnessClient({
      fetchImpl: (() => {
        throw new Error('offline')
      }) as unknown as typeof fetch,
    }),
  }
})

function account(over: Partial<Account> = {}): Account {
  return { id: 'p1', creditLimit: 1_000_000, balance: 0, pending: 0, ...over }
}

function mount(acct: Account): { host: HTMLElement; root: Root } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(<SicBoGame account={acct} onBalanceChange={() => {}} />))
  return { host, root }
}
function teardown(host: HTMLElement, root: Root) {
  act(() => root.unmount())
  host.remove()
}

function cell(host: HTMLElement, text: RegExp): HTMLButtonElement {
  const el = [...host.querySelectorAll<HTMLButtonElement>('.sicbo-cell')].find((n) =>
    text.test(n.getAttribute('aria-label') ?? ''),
  )
  if (!el) throw new Error(`no cell matching ${text}`)
  return el
}
function btn(host: HTMLElement, text: RegExp): HTMLButtonElement {
  const el = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    text.test((b.textContent ?? '').trim()),
  )
  if (!el) throw new Error(`no button matching ${text}`)
  return el
}
const staked = (host: HTMLElement) => host.querySelector('.sicbo-staked-value')?.textContent
const tokens = (host: HTMLElement) => host.querySelectorAll('.sicbo-chip-token').length
const tokenIn = (c: HTMLElement) => c.querySelector('.sicbo-chip-token')

/** Flush pending microtasks so the async roll (authority mint) settles before asserting. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  })
}

describe('SicBoGame (Stake-style table)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('lays out the full board, stakes a spot, and settles a roll without throttling', async () => {
    const acct = account()
    const { host, root } = mount(acct)

    // Every region is present — the full Stake bet set.
    expect(host.querySelectorAll('.sicbo-money').length).toBe(4) // Small / Odd / Even / Big
    expect(host.querySelectorAll('.sicbo-single').length).toBe(6)
    expect(host.querySelectorAll('.sicbo-total').length).toBe(14) // totals 4..17
    expect(host.querySelectorAll('.sicbo-combo').length).toBe(15) // the 15 two-dice combos
    expect(host.querySelectorAll('.sicbo-double').length).toBe(6)
    expect(host.querySelectorAll('.sicbo-triple').length).toBe(6)
    expect(host.querySelectorAll('.sicbo-anytriple-cell').length).toBe(1)
    expect(host.querySelectorAll('.sicbo-cell').length).toBe(52) // 52 distinct spots

    // Odd and Even are both offered (the two bets this rebuild added).
    expect(cell(host, /^Odd total/)).toBeTruthy()
    expect(cell(host, /^Even total/)).toBeTruthy()

    // Roll is disabled with nothing staked.
    expect(btn(host, /^Roll$/).disabled).toBe(true)

    // Drop the default $10 chip on Small — a chip token appears and the total updates.
    act(() => cell(host, /^Small/).click())
    expect(tokens(host)).toBe(1)
    expect(staked(host)).toBe('$10.00')
    expect(btn(host, /^Roll$/).disabled).toBe(false)

    // Roll: the server seed is minted from the fairness authority (async), then core
    // settles the wager immediately (the tumble is cosmetic). Flush the mint microtasks
    // before asserting the round has started.
    act(() => btn(host, /^Roll$/).click())
    await flush()
    expect(acct.pending).toBe(0)
    expect(host.querySelector('.sicbo-readout-idle')?.textContent).toBe('Rolling…')

    // MID-ROLL: the dice are still tumbling, so NOTHING is announced yet — no result
    // line, no win/loss highlight, no history. The outcome waits for the dice to stop.
    act(() => vi.advanceTimersByTime(400)) // before the first die settles (560ms)
    expect(host.querySelector('.sicbo-readout-idle')?.textContent).toBe('Rolling…')
    expect(host.querySelector('.sicbo-readout-res')).toBeNull()
    expect(host.querySelectorAll('.sicbo-cell.is-won, .sicbo-cell.is-lost').length).toBe(0)
    expect(host.querySelectorAll('.sicbo-historybar .pill').length).toBe(0)

    // SUSPENSE BEAT: the dice have come to rest (~840ms) and the total is shown, but
    // the win/loss is deliberately WITHHELD for a real moment — no result chip, no
    // highlight, no history yet. This is the delay between the dice stopping and the
    // outcome being revealed.
    act(() => vi.advanceTimersByTime(600)) // t≈1000ms: dice rested, before the reveal (~1260ms)
    expect(host.querySelector('.sicbo-readout-settling')).not.toBeNull()
    expect(host.querySelector('.sicbo-readout-res')).toBeNull()
    expect(host.querySelectorAll('.sicbo-cell.is-won, .sicbo-cell.is-lost').length).toBe(0)
    expect(host.querySelectorAll('.sicbo-historybar .pill').length).toBe(0)

    // REVEAL: after the beat, the outcome lands — the result chip + a history pill.
    act(() => vi.advanceTimersByTime(600)) // t≈1600ms: past the reveal
    expect(acct.balance).not.toBe(0) // Small is even-money: +$10 or −$10, never a wash
    expect(host.querySelector('.sicbo-readout-res')).not.toBeNull()
    expect(host.querySelectorAll('.sicbo-historybar .pill').length).toBe(1)

    // Betting is NOT throttled: the chip stayed on the board and Roll is live again
    // the instant the result is revealed (no post-result delay).
    expect(btn(host, /^Roll$/).disabled).toBe(false)

    teardown(host, root)
  })

  it('stacks chips on one spot into a single combined wager', async () => {
    const acct = account()
    const { host, root } = mount(acct)

    const small = cell(host, /^Small/)
    act(() => small.click())
    act(() => small.click())
    act(() => small.click()) // 3 × $10 on the same spot

    expect(tokens(host)).toBe(1) // one combined chip, not three
    expect(staked(host)).toBe('$30.00')
    expect(small.querySelector('.sicbo-chip-token-val')?.textContent).toBe('$30')

    act(() => btn(host, /^Roll$/).click())
    await flush() // await the authority-minted seed
    act(() => vi.advanceTimersByTime(1600)) // past the tumble, the cascade, and the suspense beat
    // The combined $30 settled as one even-money wager: figure moved by exactly ±$30.
    expect(Math.abs(acct.balance)).toBe(3000)
    expect(acct.pending).toBe(0)

    teardown(host, root)
  })

  it('blocks a chip that would exceed what you can wager (the money safety rail)', () => {
    const acct = account({ creditLimit: 1500 }) // can wager $15; the chip is $10
    const { host, root } = mount(acct)

    const small = cell(host, /^Small/)
    act(() => small.click()) // $10 fits
    expect(tokens(host)).toBe(1)
    expect(staked(host)).toBe('$10.00')

    act(() => small.click()) // a second $10 would be $20 > $15 — rejected
    expect(tokens(host)).toBe(1) // no new chip
    expect(staked(host)).toBe('$10.00') // unchanged
    expect(host.querySelector('.sicbo-error')).not.toBeNull()

    teardown(host, root)
  })

  it('Undo lifts exactly the last chip, in order', () => {
    const acct = account()
    const { host, root } = mount(acct)

    const small = cell(host, /^Small/)
    const big = cell(host, /^Big/)
    act(() => small.click())
    act(() => big.click()) // Small $10, Big $10 — Big placed last
    expect(staked(host)).toBe('$20.00')
    expect(tokens(host)).toBe(2)

    act(() => btn(host, /^Undo$/).click()) // removes the last chip (Big)
    expect(tokenIn(big)).toBeNull()
    expect(tokenIn(small)).not.toBeNull()
    expect(staked(host)).toBe('$10.00')

    teardown(host, root)
  })

  it('Double duplicates the board within the limit, and guards the limit', () => {
    // within limit: one $10 chip doubles to $20
    const acct = account()
    const { host, root } = mount(acct)
    const small = cell(host, /^Small/)
    act(() => small.click())
    act(() => btn(host, /^Double$/).click())
    expect(staked(host)).toBe('$20.00')
    expect(tokens(host)).toBe(1) // combined on the one spot
    expect(small.querySelector('.sicbo-chip-token-val')?.textContent).toBe('$20')
    teardown(host, root)

    // over limit: doubling $10 to $20 exceeds a $15 ceiling — no change, error shown
    const tight = account({ creditLimit: 1500 })
    const m2 = mount(tight)
    act(() => cell(m2.host, /^Small/).click()) // $10 (fits)
    act(() => btn(m2.host, /^Double$/).click()) // 2×$10 = $20 > $15 — rejected
    expect(staked(m2.host)).toBe('$10.00')
    expect(m2.host.querySelector('.sicbo-error')).not.toBeNull()
    teardown(m2.host, m2.root)
  })

  it('right-click clears only that spot, leaving the rest staked', () => {
    const acct = account()
    const { host, root } = mount(acct)

    const small = cell(host, /^Small/)
    const big = cell(host, /^Big/)
    act(() => small.click())
    act(() => big.click())
    expect(staked(host)).toBe('$20.00')

    // right-click the Small spot
    act(() =>
      small.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    )
    expect(tokenIn(small)).toBeNull() // Small cleared
    expect(tokenIn(big)).not.toBeNull() // Big untouched
    expect(staked(host)).toBe('$10.00')
    expect(btn(host, /^Roll$/).disabled).toBe(false) // a staked spot remains

    teardown(host, root)
  })
})
