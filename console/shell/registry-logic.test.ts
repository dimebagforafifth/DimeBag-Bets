/**
 * The registry logic that drives the grid: an empty default registry, the four
 * sections in fixed order, grouping that preserves order + filters by section,
 * and key lookup. Pure — no React.
 */

import { describe, it, expect } from 'vitest'
import type { ComponentType } from 'react'
import { REGISTRY, SECTIONS, groupBySection, findFeature } from '../registry/index.js'
import type { FeatureManifest, ConsoleIcon } from '../registry/types.js'

const Dot: ConsoleIcon = () => null
const Panel: ComponentType<{ onBack: () => void }> = () => null
const mk = (key: string, section: FeatureManifest['section']): FeatureManifest => ({
  key,
  name: key,
  hint: '',
  section,
  icon: Dot,
  Panel,
})

describe('registry', () => {
  it('ships empty in phase 1', () => {
    expect(REGISTRY).toEqual([])
  })

  it('defines the four sections in display order', () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(['operations', 'players', 'catalog', 'control'])
    expect(SECTIONS.map((s) => s.label)).toEqual(['Operations', 'Players', 'Catalog', 'Control'])
  })
})

describe('groupBySection', () => {
  it('returns all four sections in order, with their manifests', () => {
    const reg = [mk('b', 'control'), mk('a', 'operations'), mk('c', 'players')]
    const groups = groupBySection(reg)
    expect(groups.map((g) => g.key)).toEqual(['operations', 'players', 'catalog', 'control'])
    expect(groups[0].items.map((m) => m.key)).toEqual(['a']) // operations
    expect(groups[1].items.map((m) => m.key)).toEqual(['c']) // players
    expect(groups[2].items).toEqual([]) // catalog empty
    expect(groups[3].items.map((m) => m.key)).toEqual(['b']) // control
  })

  it('preserves manifest order within a section', () => {
    const reg = [mk('x', 'catalog'), mk('y', 'catalog')]
    expect(groupBySection(reg)[2].items.map((m) => m.key)).toEqual(['x', 'y'])
  })

  it('groups an empty registry into four empty sections', () => {
    expect(groupBySection([]).every((g) => g.items.length === 0)).toBe(true)
  })
})

describe('findFeature', () => {
  it('locates by key, null otherwise', () => {
    const reg = [mk('weekly-figures', 'operations')]
    expect(findFeature(reg, 'weekly-figures')?.key).toBe('weekly-figures')
    expect(findFeature(reg, 'nope')).toBeNull()
    expect(findFeature(reg, null)).toBeNull()
  })
})
