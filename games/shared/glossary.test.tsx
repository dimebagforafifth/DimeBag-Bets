// @vitest-environment happy-dom
/**
 * The shared glossary: the data file is well-formed and the <Term>/<InfoDot>
 * info-icon renders the term's plain-language explanation (so any casino or
 * sportsbook surface can annotate a term from one source of truth).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { GLOSSARY, glossaryEntry } from './glossary.js'
import { Term, InfoDot } from './GlossaryTerm.js'

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
const render = (node: React.ReactNode) => act(() => root.render(node))

describe('glossary data', () => {
  it('every entry has a term and a non-empty explanation, keyed by a slug', () => {
    const ids = Object.keys(GLOSSARY)
    expect(ids.length).toBeGreaterThanOrEqual(12)
    for (const [id, entry] of Object.entries(GLOSSARY)) {
      expect(id).toMatch(/^[a-z-]+$/)
      expect(entry.term.length).toBeGreaterThan(0)
      expect(entry.short.length).toBeGreaterThan(10)
    }
  })

  it('looks up known ids and returns undefined for unknown ones', () => {
    expect(glossaryEntry('parlay')?.term).toBe('Parlay')
    expect(glossaryEntry('not-a-term')).toBeUndefined()
  })
})

describe('<Term> / <InfoDot>', () => {
  it('renders the label and the term explanation as a tooltip', () => {
    render(<Term id="parlay">Parlay</Term>)
    // the visible label
    expect(host.textContent).toContain('Parlay')
    // the explanation is in the DOM as an accessible tooltip
    const tip = host.querySelector('[role="tooltip"]')
    expect(tip).not.toBeNull()
    expect(tip?.textContent).toContain(GLOSSARY.parlay.short)
    // the dot is described by the tooltip (a11y wiring)
    const dot = host.querySelector('.gloss-dot')
    expect(dot?.getAttribute('aria-describedby')).toBe(tip?.id)
  })

  it('tapping the dot opens the tooltip (touch path)', () => {
    render(<InfoDot id="vig" />)
    const dot = host.querySelector('.gloss-dot') as HTMLElement
    const tip = host.querySelector('.gloss-pop')!
    expect(tip.classList.contains('is-open')).toBe(false)
    act(() => dot.click())
    expect(host.querySelector('.gloss-pop')!.classList.contains('is-open')).toBe(true)
    expect(tip.textContent).toContain(GLOSSARY.vig.short)
  })

  it('renders nothing for an unknown id, and just the children when wrapping a label', () => {
    render(<InfoDot id="bogus" />)
    expect(host.querySelector('.gloss-dot')).toBeNull()

    render(<Term id="bogus">Plain label</Term>)
    expect(host.textContent).toBe('Plain label')
    expect(host.querySelector('.gloss-dot')).toBeNull()
  })
})
