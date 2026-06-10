// @vitest-environment happy-dom
/** Catalog panels mount, and the new panels (Scores, Manual Ticket) work. */
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getBook } from '../../app/book-store.js'
import { getResult, resetResults } from '../../sportsbook/index.js'
import { catalogManifests } from './manifest.js'
import { ScoresPanel } from './ScoresPanel.js'
import { TicketWriterPanel } from './TicketWriterPanel.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => resetResults()) // the Scores grading test writes the shared results overlay

function host(): HTMLDivElement {
  const h = document.createElement('div')
  document.body.appendChild(h)
  return h
}
function setValue(el: HTMLInputElement, v: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
function selectPlayer(h: HTMLElement, name: string) {
  const input = h.querySelector<HTMLInputElement>('.pl-search-input')!
  act(() => setValue(input, name))
  const opt = [...h.querySelectorAll('.pl-suggest-item')].find((li) =>
    (li.textContent ?? '').toLowerCase().includes(name.toLowerCase()),
  )
  if (!opt) throw new Error(`no player suggestion for "${name}"`)
  act(() => opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
}

describe('catalog panels', () => {
  it('every manifest Panel mounts without crashing', () => {
    for (const m of catalogManifests) {
      const h = host()
      const root = createRoot(h)
      const Panel = m.Panel
      act(() => root.render(<Panel onBack={() => {}} />))
      expect((h.textContent ?? '').length).toBeGreaterThan(0)
      act(() => root.unmount())
      h.remove()
    }
  })

  it('Scores renders the slate board', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<ScoresPanel />))
    expect(h.textContent).toContain('Results')
    expect(h.querySelectorAll('.cat-score-row').length).toBeGreaterThan(1) // header + fixtures
    act(() => root.unmount())
    h.remove()
  })

  it('Scores grades a fixture by hand into the shared results overlay (settles the book)', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<ScoresPanel />))
    // Open the first fixture's grader.
    const toggle = h.querySelector<HTMLButtonElement>('.cat-grade-toggle')!
    act(() => toggle.click())
    const [home, away] = h.querySelectorAll<HTMLInputElement>('.cat-grade-input')
    act(() => setValue(home, '101'))
    act(() => setValue(away, '99'))
    // Money-moving, so it takes a second confirm.
    const markFinal = [...h.querySelectorAll<HTMLButtonElement>('.cat-grade-btn')].find(
      (b) => b.textContent === 'Mark final',
    )!
    act(() => markFinal.click())
    const confirm = [...h.querySelectorAll<HTMLButtonElement>('.cat-grade-btn')].find((b) =>
      (b.textContent ?? '').startsWith('Confirm'),
    )!
    act(() => confirm.click())
    // The result is now in the shared overlay — every player's store re-grades off it.
    expect(getResult('nba-lal-bos')).toEqual({ kind: 'final', home: 101, away: 99 })
    act(() => root.unmount())
    h.remove()
  })

  it('Scores refuses to grade a fixture with blank scores (no silent 0–0)', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<ScoresPanel />))
    const toggle = h.querySelector<HTMLButtonElement>('.cat-grade-toggle')!
    act(() => toggle.click())
    const [home, away] = h.querySelectorAll<HTMLInputElement>('.cat-grade-input')
    act(() => setValue(home, '')) // explicitly blank both sides
    act(() => setValue(away, ''))
    const markFinal = [...h.querySelectorAll<HTMLButtonElement>('.cat-grade-btn')].find(
      (b) => b.textContent === 'Mark final',
    )!
    act(() => markFinal.click()) // arms
    const confirm = [...h.querySelectorAll<HTMLButtonElement>('.cat-grade-btn')].find((b) =>
      (b.textContent ?? '').startsWith('Confirm'),
    )!
    act(() => confirm.click())
    expect(getResult('nba-lal-bos')).toBeUndefined() // nothing graded
    expect(h.textContent).toContain('Enter a score for both sides')
    act(() => root.unmount())
    h.remove()
  })

  it('Manual Ticket writes a graded bet that moves the figure through core', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<TicketWriterPanel />))
    selectPlayer(h, 'Lena')
    const before = getBook().members['p-lena'].account.balance
    const [stake, mult] = h.querySelectorAll<HTMLInputElement>('.feat-input') // stake, multiplier, (select)
    act(() => setValue(stake, '10')) // 10 coins
    act(() => setValue(mult, '3')) // 3× → win profit +20 coins (2000 cents)
    const writeBtn = [...h.querySelectorAll<HTMLButtonElement>('.feat-btn')].find(
      (b) => b.textContent === 'Write ticket',
    )!
    act(() => writeBtn.click())
    expect(getBook().members['p-lena'].account.balance).toBe(before + 2000) // default grade = Win
    expect(h.textContent).toContain('graded WIN')
    act(() => root.unmount())
    h.remove()
  })
})
