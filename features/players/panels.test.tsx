// @vitest-environment happy-dom
/** Players panels mount (wired to live stores) and the action panels work end-to-end. */
import { describe, it, expect } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getBook, listPlayers } from '../../app/book-store.js'
import { playersManifests } from './manifest.js'
import { AddPlayerPanel } from './AddPlayerPanel.js'
import { PerformancePanel } from './PerformancePanel.js'
import { LimitsPanel } from './LimitsPanel.js'
import { PlayerAdminPanel } from './PlayerAdminPanel.js'
import { PendingPanel } from './PendingPanel.js'
import { AnalysisPanel } from './AnalysisPanel.js'
import { SessionsPanel } from './SessionsPanel.js'
import { listOpenTickets, __resetTickets } from './tickets.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function host(): HTMLDivElement {
  const h = document.createElement('div')
  document.body.appendChild(h)
  return h
}
function setInput(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const submit = (form: HTMLFormElement) =>
  act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
const byText = (h: HTMLElement, sel: string, text: string) =>
  [...h.querySelectorAll(sel)].find((b) => (b.textContent ?? '').trim() === text) as HTMLElement

describe('players panels', () => {
  it('every manifest Panel mounts without crashing', () => {
    for (const m of playersManifests) {
      const h = host()
      const root = createRoot(h)
      const Panel = m.Panel
      act(() => root.render(<Panel onBack={() => {}} />))
      expect((h.textContent ?? '').length).toBeGreaterThan(0)
      act(() => root.unmount())
      h.remove()
    }
    __resetTickets() // release holds the Pending mount seeded
  })

  it('Add Player onboards a single account through org.addPlayer', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<AddPlayerPanel onBack={() => {}} />))
    const before = listPlayers().length
    act(() => setInput(h.querySelectorAll<HTMLInputElement>('.feat-input')[0], 'Sidney Console'))
    submit(h.querySelector('form')!)
    expect(listPlayers().length).toBe(before + 1)
    expect(h.textContent).toContain('Added')
    act(() => root.unmount())
    h.remove()
  })

  it('Add Player bulk-onboards many at once', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<AddPlayerPanel onBack={() => {}} />))
    click(byText(h, '.feat-chip', 'Bulk'))
    const before = listPlayers().length
    act(() => setInput(h.querySelector<HTMLTextAreaElement>('.feat-textarea')!, 'Avery One\nBlake Two, 300'))
    submit(h.querySelector('form')!)
    expect(listPlayers().length).toBe(before + 2)
    expect(h.textContent).toContain('Added 2 players')
    act(() => root.unmount())
    h.remove()
  })

  it('Player Performance shows movers from the live book', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<PerformancePanel onBack={() => {}} />))
    expect(h.textContent).toContain('Top movers')
    expect(h.textContent).toContain('Bottom movers')
    expect(h.querySelectorAll('.feat-row').length).toBeGreaterThan(0)
    act(() => root.unmount())
    h.remove()
  })

  it('Limits sets a per-player max bet through org.setMaxWager (core-enforced)', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<LimitsPanel onBack={() => {}} />))
    const firstId = listPlayers()[0].id // the player <select> defaults to the first
    act(() => setInput(h.querySelectorAll<HTMLInputElement>('.feat-input')[0], '5')) // 5 coins → 500
    click(byText(h, '.feat-btn', 'Set'))
    expect(getBook().members[firstId].account.maxWager).toBe(500)
    act(() => root.unmount())
    h.remove()
  })

  it('Player Admin opens a profile with no agent/hierarchy line', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<PlayerAdminPanel onBack={() => {}} />))
    const row = h.querySelector('tbody tr.is-click')!
    click(row)
    const text = (h.textContent ?? '').toLowerCase()
    expect(text).toContain('all players') // the back link → we're in the profile
    expect(text).toContain('account controls')
    expect(text).not.toMatch(/reports to|under the manager|direct under|sub-?agent|downline/)
    act(() => root.unmount())
    h.remove()
  })

  it('Pending grades an open ticket through core, moving the figure', () => {
    __resetTickets()
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<PendingPanel onBack={() => {}} />)) // first render seeds open tickets
    const open = listOpenTickets()
    expect(open.length).toBeGreaterThan(0)
    const t0 = open[0] // first row corresponds to the first open ticket
    const acct = getBook().members[t0.playerId].account
    const before = acct.balance
    const expectedProfit = Math.round(t0.wager.stake * (t0.price - 1))
    click(h.querySelector('.feat-gradebtn.is-win')!)
    expect(listOpenTickets().some((t) => t.id === t0.id)).toBe(false)
    expect(getBook().members[t0.playerId].account.balance).toBe(before + expectedProfit)
    act(() => root.unmount())
    h.remove()
    __resetTickets() // clean up holds after the panel is gone (no subscribers to churn)
  })

  it('Analysis renders a sortable CLV table', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<AnalysisPanel onBack={() => {}} />))
    click(byText(h, '.feat-chip', 'All')) // widest window → every player has rows
    expect(h.textContent).toContain('Sharpest player')
    expect(h.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(2)
    const betsHeader = byText(h, '.feat-sort', 'Bets') ?? h.querySelector('.feat-sort')!
    click(betsHeader)
    expect(h.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(2)
    act(() => root.unmount())
    h.remove()
  })

  it('Sessions flags a shared IP in the access log', () => {
    const h = host()
    const root = createRoot(h)
    act(() => root.render(<SessionsPanel onBack={() => {}} />))
    click(byText(h, '.feat-chip', 'All')) // no time filter → shared-IP rows are visible
    expect(h.textContent).toContain('Shared IPs')
    expect(h.textContent).toContain('Shared')
    act(() => root.unmount())
    h.remove()
  })
})
