// @vitest-environment happy-dom
/**
 * Skeleton coverage — the CI guardrail behind CLAUDE.md §11 ("Skeleton loaders").
 * Every shell Section (auth/roles ALL_SECTIONS) and every registered player section
 * must have a bespoke, content-shaped skeleton, and each must render as an accessible,
 * shimmering loading region. A new section can't ship without one: add it here-or-fail.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, createElement, isValidElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ALL_SECTIONS } from '../../auth/roles.js'
import { sectionSkeleton, MAPPED_SECTION_KEYS, GameSkeleton } from './index.js'
import { getPlayerSections } from '../player-sections.js'
import '../register-player-sections.js' // side-effect: populate the player-section registry
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
const render = (node: ReactNode) => act(() => root.render(node))

/** A skeleton must announce itself as ONE busy status region and carry shimmer blocks. */
const assertAccessibleSkeleton = (label: string) => {
  const region = host.querySelector('[role="status"]')
  expect(region, `${label} should render a status region`).not.toBeNull()
  expect(region?.getAttribute('aria-busy'), `${label} should be aria-busy`).toBe('true')
  expect(host.querySelector('.sk'), `${label} should contain shimmer blocks`).not.toBeNull()
}

describe('skeleton coverage', () => {
  it('every shell Section has a bespoke skeleton mapping', () => {
    for (const key of ALL_SECTIONS) {
      expect(MAPPED_SECTION_KEYS, `section "${key}" needs a sectionSkeleton mapping`).toContain(key)
    }
  })

  it('every registered player section has a bespoke skeleton mapping', () => {
    const keys = getPlayerSections().map((s) => s.key)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(MAPPED_SECTION_KEYS, `player section "${key}" needs a sectionSkeleton mapping`).toContain(
        key,
      )
    }
  })

  it('sectionSkeleton renders an accessible, shimmering region for every section', () => {
    for (const key of ALL_SECTIONS) {
      const el = sectionSkeleton(key)
      expect(isValidElement(el), `"${key}" skeleton should be a React element`).toBe(true)
      render(el)
      assertAccessibleSkeleton(`"${key}" skeleton`)
    }
  })

  it('an unmapped key still yields a non-blank skeleton (generic fallback, never blank)', () => {
    const el = sectionSkeleton('a-brand-new-unmapped-section')
    expect(isValidElement(el)).toBe(true)
    render(el)
    assertAccessibleSkeleton('generic fallback')
  })

  it('the game skeleton is an accessible, shimmering region', () => {
    render(createElement(GameSkeleton))
    assertAccessibleSkeleton('game skeleton')
  })
})
