/**
 * Public betting splits + CLV-beat — module public surface (round 4, Lane C).
 *
 * Two read-only projections — over the RECORDED placed-bet store and the verified-record
 * projection (which itself projects the audited ledger):
 *  - PUBLIC SPLITS: per-market bets % vs handle % on each side, projected from recorded placed
 *    bets (each placed alongside its `core` hold), scoped downline-vs-global per Community
 *    Settings, surfaced on the book + a "most-bet" discovery surface.
 *  - CLV-BEAT: a profile credibility signal — closing-line-value beat (read from the verified
 *    record, honestly gated) plus the value over the de-vigged price taken.
 *
 * This module owns NO money path and mutates nothing (no core, no ledger writes, no org writes):
 * it reads recorded bets and the verified-record projection and computes shares. See
 * splits.ts (`reconcile`) for the cardinal invariant, and no-money.test.ts for the static guard.
 *
 * The Splits player section self-registers with the player-section registry (idempotent by key);
 * the WIRING PASS mounts the registry into the shell + adds the 'splits' auth section. The
 * console tile rides `splitsManifests` (manifest.ts). See README / report.
 */

import { createElement } from 'react'
import { registerPlayerSection, type PlayerSectionManifest } from '../app/player-sections.js'
import { SplitsSection } from './ui/SplitsSection.js'

export type {
  SplitBet,
  SideSplit,
  MarketSplit,
  RankBy,
  RankedMarket,
  SplitReconciliation,
} from './types.js'

export {
  toSplitBets,
  splitOfMarket,
  marketSplits,
  splitForMarket,
  mostBetMarkets,
  reconcile,
  roundShares,
} from './splits.js'
export {
  scopedSplitBets,
  marketSplitsFor,
  splitForMarketScoped,
  mostBetMarketsFor,
  viewerHasDownline,
  defaultSplitScope,
  scopeToggleAllowed,
  subscribeSplits,
  splitsVersion,
} from './source.js'
export { clvBeat, valueVsTaken, type ClvBeatView, type ValueSummary, type ValueLeg } from './clv.js'
export { clvBeatFor } from './clv-source.js'

export { MarketSplitBar } from './ui/MarketSplitBar.js'
export { ClvBeatCard } from './ui/ClvBeatCard.js'
export { SplitsSection } from './ui/SplitsSection.js'
export { SplitsConsolePanel } from './ui/SplitsConsolePanel.js'
export { splitsManifests } from './manifest.js'

/**
 * The player-facing "Splits" section — most-bet discovery + per-market public splits + the
 * viewer's own CLV-beat. Registered below (idempotent by key); the wiring pass renders the
 * registry and adds 'splits' to auth/roles.ts in all three places — the `Section` union, plus
 * the `ALL_SECTIONS` and `PLAYER_SECTIONS` arrays.
 */
export const splitsSection: PlayerSectionManifest = {
  key: 'splits',
  label: 'Splits',
  roles: ['player', 'agent', 'subagent', 'manager'],
  render: (ctx) =>
    createElement(SplitsSection, {
      viewerId: ctx.viewerId,
      playerId: ctx.player.id,
      role: ctx.role,
    }),
}

// SEAM: register from our own module file (idempotent by key) so the wiring pass only renders
// the registry — it never edits this module. Importing `splits/` wires the Splits section.
registerPlayerSection(splitsSection)
