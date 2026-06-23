// @vitest-environment happy-dom
/**
 * The operator console panel authors a competition (from a template) and runs its lifecycle —
 * Create, then Close — driving the real store + core path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CompetitionsConsolePanel } from './CreatorConsolePanel.js'
import { competitionsManifests } from '../manifest.js'
import { getCompetitions, createCompetition, __resetCompetitions } from '../../events/index.js'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLElement
let root: Root
beforeEach(() => {
  __resetCompetitions()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const byText = (txt: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === txt)

describe('manifest', () => {
  it('registers a rewards-section Competitions tile', () => {
    expect(competitionsManifests[0]).toMatchObject({ key: 'competitions', section: 'rewards' })
  })
})

describe('CompetitionsConsolePanel', () => {
  it('creates a competition from the form and lists it', () => {
    act(() => root.render(<CompetitionsConsolePanel onBack={() => {}} />))
    // template chips present
    expect(byText('Weekly Action Race')).toBeTruthy()
    expect(getCompetitions()).toHaveLength(0)
    act(() => byText('Create competition')!.click())
    expect(getCompetitions()).toHaveLength(1)
    expect(host.textContent).toContain('Running competitions')
  })

  it('offers no Close for a still-live competition (a contest settles only after it ends)', () => {
    act(() => root.render(<CompetitionsConsolePanel onBack={() => {}} />))
    act(() => byText('Create competition')!.click()) // template window starts now → live
    expect(getCompetitions()[0].settlement).toBe('open')
    expect(byText('Close')).toBeUndefined()
  })

  it('closes then pays an ENDED competition through the console', () => {
    // an already-ended event (window in the past) so the console exposes Close → Pay out
    const c = createCompetition({
      name: 'Done Deal',
      theme: 'custom',
      metric: 'wagered',
      startsAt: 1,
      endsAt: 2,
      entryFeeCents: 0,
      guaranteedCents: 50_000,
      payoutSplit: [1],
      eligibility: { kind: 'all' },
      createdBy: 'operator',
    })
    act(() => root.render(<CompetitionsConsolePanel onBack={() => {}} />))
    act(() => byText('Close')!.click())
    expect(getCompetitions().find((x) => x.id === c.id)!.settlement).toBe('closed')
    act(() => byText('Pay out')!.click())
    expect(getCompetitions().find((x) => x.id === c.id)!.settlement).toBe('paid')
  })
})
