// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ImportPanel } from './ImportPanel.js'
import { importManifests } from './manifest.js'
import { __resetImport, __seedImport } from './index.js'
import { listPlayers } from '../../app/book-store.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetImport()
  __seedImport()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  __resetImport()
})

const q = <T extends Element = Element>(sel: string) => [...host.querySelectorAll<T>(sel)]
const btn = (text: string): HTMLButtonElement =>
  q<HTMLButtonElement>('button').find((b) => (b.textContent ?? '').includes(text))!

describe('Player Import — console tile', () => {
  it('manifest targets Operations with a non-colliding key', () => {
    const m = importManifests[0]
    expect(m.key).toBe('operator-import')
    expect(m.section).toBe('operations')
    expect(m.Panel).toBe(ImportPanel)
  })

  it('lists the seeded imports', () => {
    act(() => root.render(<ImportPanel onBack={() => {}} />))
    expect(q('.imp-row').length).toBeGreaterThanOrEqual(2)
    expect(host.textContent).toMatch(/Acme Book/)
  })

  it('walks upload → map → validate → commit, and the commit lands in the live book', () => {
    ;(window as unknown as { confirm: () => boolean }).confirm = () => true
    act(() => root.render(<ImportPanel onBack={() => {}} />))

    // Open the newest seeded batch (Acme) → the wizard shows the mapping editor + preview.
    act(() => q<HTMLElement>('.imp-row')[0].click())
    expect(q('.imp-map').length).toBe(1)
    expect(q('.imp-preview').length).toBe(1)
    expect(host.textContent).toMatch(/Marco Reyes/)

    // Commit is gated until validation has run.
    expect(btn('Commit import').disabled).toBe(true)

    // Validate → a summary appears and the status flips to Validated.
    act(() => btn('Validate').click())
    expect(q('.imp-kpis').length).toBe(1)
    expect(q('.imp-badge.imp-validated').length).toBeGreaterThanOrEqual(1)
    // The sample exercises every outcome: created (pending), skipped (dup), error (no name / deep).
    expect(q('.imp-res-skipped').length).toBeGreaterThanOrEqual(1)
    expect(q('.imp-res-error').length).toBeGreaterThanOrEqual(1)
    expect(btn('Commit import').disabled).toBe(false)

    // Nobody created yet (dry run only).
    expect(listPlayers().some((p) => p.name === 'Marco Reyes')).toBe(false)

    // Commit → status becomes Committed, rows report created, AND the members + figures land.
    act(() => btn('Commit import').click())
    expect(q('.imp-badge.imp-committed').length).toBeGreaterThanOrEqual(1)
    expect(q('.imp-res-created').length).toBeGreaterThanOrEqual(1)
    const marco = listPlayers().find((p) => p.name === 'Marco Reyes')!
    expect(marco).toBeTruthy()
    expect(marco.account.balance).toBe(-45000) // -$450 opening figure, via the audited core path
  })

  it('shows the empty state with no imports', () => {
    __resetImport() // clear the seed
    act(() => root.render(<ImportPanel onBack={() => {}} />))
    expect(host.textContent).toMatch(/No imports yet/)
    expect(q('.imp-row')).toHaveLength(0)
  })

  it('creates a draft from pasted rows via the New import form', () => {
    __resetImport()
    act(() => root.render(<ImportPanel onBack={() => {}} />))
    act(() => btn('New import').click())
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea.imp-paste')!
    setValue(textarea, 'name,creditline\nPasted Pat,900')
    act(() => btn('Create draft').click())
    // The new draft opens straight into the wizard with its auto-detected mapping + preview.
    expect(q('.imp-map').length).toBe(1)
    expect(host.textContent).toMatch(/Pasted Pat/)
  })
})

/** Set a controlled input/textarea value and fire React's onChange. */
function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  act(() => el.dispatchEvent(new Event('input', { bubbles: true })))
}
