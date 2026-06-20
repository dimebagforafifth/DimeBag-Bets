/**
 * Pools & Leagues — public surface.
 *
 * Betting pools (a competition with a format plugin) + user-created season leagues. Entries +
 * prizes move ONLY through core (escrow.ts), pool-conserving; standings are read-only projections.
 *
 * // SEAM (wiring pass): this lane ships a self-describing player-section descriptor (poolsSection)
 * and a console manifest (pools/manifest.ts) — the wiring pass mounts them WITHOUT this lane editing
 * the shared registry/shell/auth. See poolsSection below + manifest.ts for the exact lines.
 */

export type {
  PoolKind,
  PoolScope,
  PoolPrivacy,
  PoolLifecycle,
  Pool,
  PoolEntry,
  PoolInvite,
  PoolPayout,
  LeagueSeason,
} from './types.js'

export type {
  PoolConfig,
  PoolPicks,
  PoolResults,
  PoolFormat,
  FormatStanding,
  FormatWinner,
} from './formats/types.js'
export { formatFor, formatForOrNull, FORMAT_KINDS } from './formats/index.js'

export {
  POOL_ENTRY_KEY,
  holdEntryFee,
  settlePoolMoney,
  voidPoolMoney,
  type EntryHold,
  type SettleMoneyInput,
  type SettleMoneyResult,
} from './escrow.js'

export { poolStandings, poolWinners, emptyResultsFor } from './standings.js'

export {
  subscribePools,
  poolsVersion,
  getPools,
  getPool,
  entriesForPool,
  entriesForAccount,
  isEntered,
  invitesForPool,
  getLeague,
  leagueForPool,
  canJoinPool,
  visiblePools,
  createPool,
  enterPool,
  lockPool,
  postResults,
  settlePool,
  voidPool,
  invitePlayer,
  createLeague,
  postWeekResults,
  __resetPools,
  __seedPools,
  type CreatePoolInput,
  type EnterPoolInput,
  type CreateLeagueInput,
} from './store.js'

export {
  getPoolsPolicy,
  subscribePoolsPolicy,
  getPoolsPolicyVersion,
  canSetPoolsPolicy,
  poolCreationAllowed,
  updatePoolsPolicy,
  __resetPoolsPolicy,
  DEFAULT_POOLS_POLICY,
  type PoolsPolicy,
} from './policy.js'

export { PoolsSection } from './ui/PoolsSection.js'
export { PoolsConsolePanel } from './ui/PoolsConsolePanel.js'

import { PoolsSection } from './ui/PoolsSection.js'
import type { PlayerSectionDescriptor } from '../social/index.js'

/**
 * A self-describing player-section descriptor (mirrors p2p's challengesSection).
 *
 * // SEAM (wiring pass): mount via app/register-player-sections.tsx with one block —
 *   registerPlayerSection({ key: poolsSection.id, label: poolsSection.label, roles: poolsSection.roles,
 *     render: (ctx) => <PoolsSection viewerId={ctx.viewerId} viewerName={ctx.player.name}
 *       account={ctx.account} onBalanceChange={ctx.onBalanceChange} role={ctx.role} /> })
 * and add 'pools' to the Section union + ALL_SECTIONS + PLAYER_SECTIONS in auth/roles.ts.
 */
export const poolsSection: PlayerSectionDescriptor = {
  id: 'pools',
  label: 'Pools',
  roles: ['player', 'manager'],
  Component: PoolsSection,
}
