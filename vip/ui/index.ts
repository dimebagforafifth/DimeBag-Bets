/**
 * The VIP UI surface — three self-contained, presentational components the app
 * shell mounts: the player leaderboard, the manager VIP console, and the compact
 * VIP card that sits near a player's balance. All read the live VIP store and
 * format money via games/shared/money.ts; none of them moves money.
 */

export { Leaderboard, RankBadge } from './Leaderboard.js'
export { VipPanel } from './VipPanel.js'
export { VipBadge } from './VipBadge.js'
