/**
 * Boosts — profit & odds boosts via the bonus engine (round 4, Lane B). Module public surface.
 *
 * A boost issues value ONLY through the existing bonus-rules engine's grant path (no new money
 * path): authoring a boost writes a `profit-boost` bonus rule; at settlement a winning, qualifying
 * bet has its uplift granted via the engine (`grantRuleTo`). The slip qualifier + odds-boost
 * pricing are this module's; everything money is the engine's.
 *
 * // SEAM (wiring): (1) spread `boostsManifest` into `rewardsAdminManifests`
 * (features/rewards/manifest.ts) — done in this lane; (2) the "Boosts" player section
 * self-registers below; add the `'boosts'` key to auth/roles.ts and import this module from
 * app/register-player-sections so it mounts; (3) call `armBoostEngine()` at app start (the panel
 * also arms it on mount).
 */

import { registerPlayerSection, type PlayerSectionManifest } from '../app/player-sections.js'
import { BoostsSection } from './ui/BoostsSection.js'

export type { BoostType, BoostQualifier, BoostDef } from './types.js'
export * from './store.js'
export * from './match.js'
export * from './pricing.js'
export * from './engine.js'
export { boostsManifest } from './boosts-tile.js'
export { BoostsPanel } from './ui/BoostsPanel.js'
export { BoostsSection } from './ui/BoostsSection.js'

/** The Boosts player-facing section. */
export const boostsSectionManifest: PlayerSectionManifest = {
  key: 'boosts',
  label: 'Boosts',
  roles: ['player', 'manager'],
  render: (ctx) => <BoostsSection viewerId={ctx.viewerId} />,
}

// Self-register (idempotent by key) so the wiring pass only adds the import + the auth key.
registerPlayerSection(boostsSectionManifest)
