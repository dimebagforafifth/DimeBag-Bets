/**
 * The console registry + the logic that renders the app grid from it and mounts
 * the active feature's Panel.
 *
 * Phase 1 ships an EMPTY registry: the shell renders cleanly with no features
 * (graceful empty state). In phase 2 the feature agents' manifests are merged in
 * at the seam below — this file imports NO feature components today.
 */

import type { ConsoleSection, FeatureManifest } from './types.js'

// SEAM: feature manifests merged in phase 2
export const REGISTRY: FeatureManifest[] = []

/** The four sections, in display order: Operations · Players · Catalog · Control. */
export const SECTIONS: { key: ConsoleSection; label: string }[] = [
  { key: 'operations', label: 'Operations' },
  { key: 'players', label: 'Players' },
  { key: 'catalog', label: 'Catalog' },
  { key: 'control', label: 'Control' },
]

export interface SectionGroup {
  key: ConsoleSection
  label: string
  items: FeatureManifest[]
}

/** Group a registry into the four sections in order (empty sections kept; the grid
 *  drops them from view). Preserves each section's manifest order. */
export function groupBySection(registry: readonly FeatureManifest[]): SectionGroup[] {
  return SECTIONS.map((s) => ({
    ...s,
    items: registry.filter((m) => m.section === s.key),
  }))
}

/** Find a manifest by its key (null if absent). */
export function findFeature(registry: readonly FeatureManifest[], key: string | null): FeatureManifest | null {
  if (key == null) return null
  return registry.find((m) => m.key === key) ?? null
}

// The React orchestrator that renders this grouped grid and mounts the active
// Panel lives in `console/shell/Console` (JSX) and consumes the logic above —
// a one-way shell → registry dependency (no import cycle).
export type { FeatureManifest, ConsoleSection, ConsoleIcon } from './types.js'
