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
import { collectionsManifests } from '../../features/collections/manifest.js'
import { agentsManifests } from '../../features/agents/manifest.js'
import { cashierDeskManifests } from '../../features/cashier/manifest.js'
import { operatorManualManifests } from '../../features/help/manifest.js'
import { rewardsAdminManifests } from '../../features/rewards/manifest.js'
// Round-3 lanes ship ready-to-mount manifests; the registry owner spreads them in (the lanes
// don't edit this shared file). C → Margin & Pricing (Control); D → CRM/analytics (3 Players
// tiles + 1 Control tile). groupBySection routes each tile to its section regardless of order.
import { crmManifests } from '../../features/crm/manifest.js'
// Round-4: C's creator/competitions console tile (author & run branded contests → Rewards).
import { competitionsManifests } from '../../creator/manifest.js'
// Upgrade round — four lanes ship ready-to-mount manifests; the registry owner spreads them here
// (the lanes don't edit this shared file). A → Economy Mode (Control); B → SGP Rules + Casino Edge
// (Catalog, both SINGLE manifest objects, added bare not spread); C → Challenges Desk (Operations);
// D → Player Import (Operations). groupBySection routes each tile to its section regardless of order.
import { economyManifests } from '../../features/economy/manifest.js'
import { sgpRulesManifest } from '../../app/book/sgp-rules-tile.js'
import { casinoEdgeManifest } from '../../app/casino-edge/casino-edge-tile.js'
import { challengesDeskManifests } from '../../p2p/manifest.js'
import { importManifests } from '../../features/import/manifest.js'
// Round 2 (Trading & Monetization): B → Trading Desk (Control, single manifest object added bare);
// C → Billing & Invoices (Operations, spread). Neither lane edits this shared file.
import { tradingDeskManifest } from '../../trading/trading-desk-tile.js'
import { billingManifests } from '../../billing/manifest.js'
// Round 3 (Community & Contests): C → Pools & Leagues (Operations, spread); D → Responsible Play
// (Players, spread). Neither lane edits this shared file. (A/B's profile is a player-facing
// section, not a console tile, so it mounts via register-player-sections, not here.)
import { poolsManifests } from '../../pools/manifest.js'
import { responsiblePlayManifests } from '../../features/responsible-play/manifest.js'

/** Every console feature, grouped into sections at render time by `groupBySection`.
 *  Listed in section order so each section's tiles read top-to-bottom as written. */
export const REGISTRY: FeatureManifest[] = [
  // Operations
  ...operationsManifests,
  ...weeklySheetManifests,
  ...ledgerManifests,
  ...settlementRunManifests,
  ...collectionsManifests,
  ...challengesDeskManifests, // Challenges Desk (C — operator settle/void of P2P challenges)
  ...importManifests, // Player Import (D — migrate a legacy book via CSV)
  ...billingManifests, // Billing & Invoices (r2 C — operator fiat per-head billing)
  ...poolsManifests, // Pools & Leagues (r3 C — operate player-run pools/leagues/squares)
  // Players
  ...playersManifests,
  ...agentsManifests,
  ...cashierDeskManifests,
  ...responsiblePlayManifests, // Responsible Play (r3 D — read-only player self-limits view)
  // Catalog
  ...catalogManifests,
  sgpRulesManifest, // SGP Rules (B — same-game-parlay conflict gate; single manifest)
  casinoEdgeManifest, // Casino Edge (B — per-game house-edge bands; SUPERSEDES the flat-RTP control)
  // Control
  ...controlManifests,
  // (Margin & Pricing / features/pricing retired — the Trading Desk is the single pricing surface.)
  ...economyManifests, // Economy Mode (A — credit/PPH ↔ balance/wallet, whole book)
  tradingDeskManifest, // Trading Desk (r2 B — margins, overrides, limits, suspensions; single manifest)
  ...operatorManualManifests,
  // Rewards (the loyalty program admin)
  ...rewardsAdminManifests,
  ...competitionsManifests, // Competitions creator (C — author & run contests)
  // CRM + analytics (D — read-only back-office: Player CRM / Integrity / Abuse Watch in
  // Players, Analytics in Control; grouped to their sections at render)
  ...crmManifests,
]

/** The console sections, in display order. */
export const SECTIONS: { key: ConsoleSection; label: string }[] = [
  { key: 'operations', label: 'Operations' },
  { key: 'players', label: 'Players' },
  { key: 'catalog', label: 'Catalog' },
  { key: 'rewards', label: 'Rewards' },
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
