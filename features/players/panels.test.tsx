// @vitest-environment happy-dom
/** Players panels mount (adapters wire to the live stores) and the action panels work. */
import { describe, it, expect } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { getBook, listPlayers } from '../../app/book-store.js'
import { playersManifests } from './manifest.js'
import { AddPlayerPanel } from './AddPlayerPanel.js'
import { PerformancePanel } from './PerformancePanel.js'
import { LimitsPanel } from './LimitsPanel.js'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

describe('players panels', () => {
  it('every manifest Panel mounts without crashing', () => {
    for (const m of playersManifests) {
      const h = host()
      const root: Root = createRoot(h)
      const Panel = m.Panel
      act(() => root.render(<Panel onBack={() => {}} />))
      expect((h.textContent ?? '').length).toBeGreaterThan(0)
      act(() => root.unmount())
      h.remove()
    }
  })

  it('Add Player onboards a new account through org.addPlayer', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<AddPlayerPanel onBack={() => {}} />))
    const before = listPlayers().length
    const name = h.querySelectorAll<HTMLInputElement>('.feat-input')[0]
    act(() => setValue(name, 'Sidney Console'))
    act(() => h.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(listPlayers().length).toBe(before + 1)
    expect(h.textContent).toContain('Added')
    act(() => root.unmount())
    h.remove()
  })

  it('Player Performance shows movers from the live book', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<PerformancePanel />))
    expect(h.textContent).toContain('Top movers')
    expect(h.textContent).toContain('Bottom movers')
    expect(h.querySelectorAll('.feat-row').length).toBeGreaterThan(0)
    act(() => root.unmount())
    h.remove()
  })

  it('Limits sets a per-player wager cap through org.setMaxWager', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<LimitsPanel />))
    selectPlayer(h, 'Marco')
    const maxInput = h.querySelectorAll<HTMLInputElement>('.feat-input')[0]
    act(() => setValue(maxInput, '5')) // $5.00 → 500 coins
    const setBtn = [...h.querySelectorAll<HTMLButtonElement>('.feat-btn')].find((b) => b.textContent === 'Set')!
    act(() => setBtn.click())
    expect(getBook().members['p-marco'].account.maxWager).toBe(500)
    act(() => root.unmount())
    h.remove()
  })
})
