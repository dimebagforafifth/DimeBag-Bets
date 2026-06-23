/**
 * Pick'em — a PrizePicks-style player-prop ladder. The player picks 2–6 player-prop
 * projections HIGHER or LOWER and wins a FIXED multiplier (POWER = all-or-nothing,
 * FLEX = miss one, still cash). The edge is STRUCTURAL — baked into the payout table, not
 * the lines — so it survives whatever the player picks. Props are READ off the shared odds
 * feed (lib/odds, read-only); every stake/payout runs through `core` (integer cents,
 * audited). Credits/balance only — no cash, no cash value, no withdrawal.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * // SEAM (wiring pass): MOUNTING THE SECTION.
 * There is no player-section registry on this branch — sections are still hard-coded in the
 * shared shell — and lane rules forbid a feature editing the shell. So Pick'em ships
 * READY-TO-MOUNT; the wiring pass applies this two-file change (the standing "a wiring pass
 * connects the lanes" rule). Nothing else is needed — the component is self-contained.
 *
 *   1) auth/roles.ts — add 'pickem' to the Section union, ALL_SECTIONS, and PLAYER_SECTIONS:
 *        export type Section = … | 'leaderboard' | 'pickem' | 'management'
 *        ALL_SECTIONS:    [ …, 'leaderboard', 'pickem', 'management' ]
 *        PLAYER_SECTIONS: [ …, 'leaderboard', 'pickem' ]
 *
 *   2) app/App.tsx —
 *        import { PickemSection } from './index.js'
 *        NAV: add { key: 'pickem', label: "Pick'em" }
 *        render: add a clause (mirrors the 'rewards' / 'sportsbook' cases)
 *          ) : activeSection === 'pickem' ? (
 *            account && player ? (
 *              <PickemSection
 *                account={account}
 *                playerName={player.name}
 *                isDemo={isDemo}
 *                onBalanceChange={refresh}
 *              />
 *            ) : ( <NoPlayer onManage={() => setSection('management')} allSuspended={allSuspended} canManage={canManage(role)} /> )
 *          )
 *
 * `pickemSectionMeta` below is the descriptor a future Section registry would consume so the
 * mount becomes data, not a code edit.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */

import { PickemSection, type PickemSectionProps } from './ui/PickemSection.js'

export { PickemSection, type PickemSectionProps }

/** A registry-ready descriptor for the Pick'em player section (for when the shell grows a
 *  section registry — until then, the wiring pass mounts PickemSection per the SEAM above). */
export const pickemSectionMeta = {
  key: 'pickem' as const,
  label: "Pick'em",
  /** Player-facing lane (sibling of casino / sportsbook / rewards). */
  player: true,
  Component: PickemSection,
}

// Payout/edge config — the one place an operator tunes the product (tables + structural edge).
export {
  POWER_TABLE,
  FLEX_TABLE,
  PICK_PROBABILITY,
  MIN_PICKS,
  MAX_PICKS,
  FLEX_MIN_PICKS,
  modeAvailable,
  payoutMultiple,
  topMultiple,
  expectedReturn,
  impliedEdge,
  derivePowerTable,
  type PickemMode,
} from './config.js'

// Grading (pure) — power/flex, void handling, contradiction guard.
export {
  gradeEntry,
  hasContradiction,
  pickIdentity,
  type GradedEntry,
  type PickSide,
  type PickResult,
} from './engine.js'

// The board — read the odds feed's player props (read-only) + the seeded demo board.
export {
  feedProjections,
  boardProjections,
  findProjection,
  statLabel,
  type Projection,
} from './projections.js'

// Entries — the money path (stake/settle through core) + the live store.
export {
  placeEntry,
  settleEntry,
  seedDemoEntries,
  getEntries,
  entriesForAccount,
  atRiskCents,
  subscribeEntries,
  getEntriesVersion,
  __resetEntries,
  type PickemEntry,
  type EntryPick,
  type PlaceEntryInput,
} from './entries.js'
