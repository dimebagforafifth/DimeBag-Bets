/**
 * The console registry + the logic that renders the app grid from it and mounts
 * the active feature's Panel.
 *
 * The four feature sections' manifest arrays are merged into REGISTRY below; the
 * shell renders the grid from it and mounts each tile's Panel on click. Adding a
 * feature is a one-line spread here.
 */

import type { ConsoleSection, FeatureManifest } from './types.js'
import { operationsManifests } from '../../features/operations/manifest.js'
import { playersManifests } from '../../features/players/manifest.js'
import { catalogManifests } from '../../features/catalog/manifest.js'
import { controlManifests } from '../../features/control/manifest.js'
// The money-desk lane + the org member list, folded into their sections (these used
// to ride a preview shim in app/App.tsx; they're first-class console features now).
import { weeklySheetManifests } from '../../features/figures/manifest.js'
import { ledgerManifests } from '../../features/transactions/manifest.js'
import { settlementRunManifests } from '../../features/settlements/manifest.js'
import { agentsManifests } from '../../features/agents/manifest.js'
import { cashierDeskManifests } from '../../features/cashier/manifest.js'
import { operatorManualManifests } from '../../features/help/manifest.js'

/** Every console feature, grouped into sections at render time by `groupBySection`.
 *  Listed in section order so each section's tiles read top-to-bottom as written. */
export const REGISTRY: FeatureManifest[] = [
  // Operations
  ...operationsManifests,
  ...weeklySheetManifests,
  ...ledgerManifests,
  ...settlementRunManifests,
  // Players
  ...playersManifests,
  ...agentsManifests,
  ...cashierDeskManifests,
  // Catalog
  ...catalogManifests,
  // Control
  ...controlManifests,
  ...operatorManualManifests,
]

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
export function findFeature(
  registry: readonly FeatureManifest[],
  key: string | null,
): FeatureManifest | null {
  if (key == null) return null
  return registry.find((m) => m.key === key) ?? null
}

// The React orchestrator that renders this grouped grid and mounts the active
// Panel lives in `console/shell/Console` (JSX) and consumes the logic above —
// a one-way shell → registry dependency (no import cycle).
export type { FeatureManifest, ConsoleSection, ConsoleIcon } from './types.js'
