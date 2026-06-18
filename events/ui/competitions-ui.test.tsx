// @vitest-environment happy-dom
/**
 * The Competitions player section renders the seeded events with populated leaderboards, and
 * tapping Join opts the player in through the store (a free event holds nothing).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CompetitionsSection } from './CompetitionsSection.js'
import { getBook } from '../../app/book-store.js'
import { __resetCompetitions, entriesForAccount } from '../store.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetCompetitions()
  for (const m of Object.values(getBook().members)) m.account.pending = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(id = 'p-marco') {
  const m = getBook().members[id]
  act(() => root.render(<CompetitionsSection account={m.account} playerName={m.name} isDemo />))
  return m
}

describe('CompetitionsSection', () => {
  it('renders the four seeded competitions with populated boards', () => {
    render()
    expect(host.querySelectorAll('.comp-card').length).toBe(4)
    expect(host.querySelectorAll('.comp-row').length).toBeGreaterThan(3)
    expect(host.textContent).toContain('Weekly Action Race')
  })

  it('joining the real free-roll opts the player in (demo samples are not joinable)', () => {
    const m = render()
    // the demo events are display-only samples; the only joinable card is the real free-roll
    const joinBtn = host.querySelector<HTMLButtonElement>('.comp-join')
    expect(joinBtn).not.toBeNull()
    act(() => joinBtn!.click())
    expect(entriesForAccount(m.account.id)).toHaveLength(1)
    expect(m.account.pending).toBe(0) // free entry — nothing held
  })
})
