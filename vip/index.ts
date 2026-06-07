/**
 * Public surface of the VIP ranks + leaderboard + free-play module. The app shell
 * and the management/VIP UI import from here. This module derives numbers and owns
 * its own config + per-player state; money still flows only through `core`.
 */

export type {
  RankId,
  RankDef,
  VipConfig,
  PlayerVip,
  RankProgress,
  LeaderboardRow,
} from './types.js'

export { RANK_ORDER, defaultRanks } from './ranks.js'

export {
  defaultVipConfig,
  rankFor,
  rankProgress,
  leaderboardRows,
  unclaimedRewards,
  grantRewards,
  setReleased,
  setAutoGrant,
  setRankMinWagered,
  setRankReward,
} from './vip.js'
