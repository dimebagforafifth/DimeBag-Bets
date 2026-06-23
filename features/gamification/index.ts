/**
 * Public surface of the gamification module (CLAUDE.md §5). Missions, achievements, XP,
 * tournaments, and a daily reward wheel — every reward pays out as free-play through the
 * shared `core.grant` (the VIP path). The module owns its config + per-player progress
 * and persists them; money still flows only through core. The app shell mounts the player
 * panel and the standalone operator config page.
 */

export type {
  MissionDef,
  MissionProgress,
  MissionCadence,
  MissionMetric,
  AchievementDef,
  AchievementState,
  AchievementMetric,
  WheelSegment,
  WheelConfig,
  TournamentDef,
  TournamentMetric,
  TournamentStanding,
  PlayerState,
  GamificationConfig,
  RewardResult,
} from './types.js'

export { defaultGamificationConfig } from './config.js'

// Engine / integration surface (real-time progress + idempotent payouts via core).
export {
  recordPlay,
  claimRewards,
  spinWheel,
  canSpin,
  nextSpinAt,
  settleTournament,
  tournamentStandings,
  tournamentEnded,
  getConfig,
  getPlayerState,
  playerMissions,
  subscribeGamification,
  getGamificationVersion,
  updateConfig,
  setWheelSegment,
  setWheelEnabled,
  setWheelCooldownHours,
  setMission,
  setAchievement,
  setTournament,
  __resetGamification,
  type WheelResult,
  type TournamentPayout,
} from './store.js'

// Pure helpers other lanes may read (display/derivation only — never money).
export { levelForXp, levelFromXp, XP_PER_LEVEL, XP_PER_BET } from './xp.js'
export { probabilities, pickSegment } from './wheel.js'
export { standings, rankEntries } from './tournaments.js'

// UI: player hub + standalone operator config page (exported, NOT mounted here).
export { GamificationPanel, GamificationConfigPage } from './ui/index.js'
