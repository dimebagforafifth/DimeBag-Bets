// @vitest-environment happy-dom
/** The Members directory lists everyone with name + role, filters, and opens a
 *  read-only profile on click. No mutations — read-only over the shared stores. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MembersPanel } from './MembersPanel.js'
import { membersManifests } from './manifest.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const rows = () => [...host.querySelectorAll<HTMLButtonElement>('.dir-row')]
const rowByRole = (label: string) =>
  rows().find((b) => b.querySelector('.dir-badge')?.textContent === label)
const profile = () => host.querySelector('.dir-profile')?.textContent ?? ''
const setSearch = (v: string) => {
  const input = host.querySelector('.mdsk-search-input') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('Members directory', () => {
  it('manifest targets Players with a non-colliding key', () => {
    expect(membersManifests[0].key).toBe('members')
    expect(membersManifests[0].section).toBe('players')
  })

  it('lists every non-manager member with their role, and filters by search', () => {
    act(() => root.render(<MembersPanel onBack={() => {}} />))
    expect(rows().length).toBeGreaterThan(3)
    // all three tiers present, manager excluded
    expect(rowByRole('Super-Agent')).toBeTruthy()
    expect(rowByRole('Agent')).toBeTruthy()
    expect(rowByRole('Player')).toBeTruthy()
    expect(rowByRole('Manager')).toBeUndefined()

    // search narrows the list
    const firstName = rows()[0].querySelector('.dir-name')?.textContent?.replace(/inactive/, '').trim() ?? ''
    setSearch(firstName.slice(0, 3))
    expect(rows().length).toBeGreaterThan(0)
    expect(rows().every((r) => r.textContent?.toLowerCase().includes(firstName.slice(0, 3).toLowerCase()))).toBe(true)
  })

  it('opens a profile with standing; a player gets a betting card', () => {
    act(() => root.render(<MembersPanel onBack={() => {}} />))
    expect(host.querySelector('.dir-profile')).toBeNull() // nothing selected yet

    act(() => rowByRole('Player')!.click())
    expect(profile()).toMatch(/Balance/)
    expect(profile()).toMatch(/Credit limit/)
    expect(profile()).toMatch(/Betting/)
    expect(profile()).toMatch(/Win rate/)
    expect(profile()).toMatch(/Recent activity/)

    // a super-agent shows downline stats instead of a betting card
    act(() => rowByRole('Super-Agent')!.click())
    expect(profile()).toMatch(/Players under/)
    expect(profile()).not.toMatch(/Win rate/)
  })
})
