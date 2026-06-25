/**
 * Public surface of the shared credit/balance core (CLAUDE.md §3).
 * Games and the sportsbook import from here — never copy this logic.
 */

export type { Account, Wager, Outcome, WagerStatus } from './types.js'
export {
  availableToWager,
  maxBet,
  placeWager,
  placeWagers,
  resolveWager,
  resolveAtMultiplier,
  settleWeek,
  adjustBalance,
  grant,
  onWagerResolved,
  onWagerPlaced,
  onGrant,
  onSettlement,
  setWagerIdFactory,
  __resetWagerIds,
} from './core.js'
export type { ResolveEvent, PlaceEvent, GrantEvent, SettlementRecord } from './core.js'
export type { EconomyMode, EconomyPolicy } from './economy.js'
export {
  DEFAULT_ECONOMY_POLICY,
  getEconomyMode,
  getEconomyPolicy,
  getBalanceFloorCents,
  setEconomyPolicy,
  setActiveEconomyTenant,
  getActiveEconomyTenant,
  __resetEconomy,
} from './economy.js'
export type {
  LimitKind,
  LimitPeriod,
  LimitInput,
  ActiveLimit,
  LimitUsage,
  LimitUsageReader,
} from './limits.js'
export {
  LOOSEN_DELAY_MS,
  periodStartMs,
  setPlayerLimit,
  clearPlayerLimit,
  installPlayerLimit,
  getEffectiveLimits,
  getPlayerLimitState,
  hasLimits,
  assertWithinLimits,
  setLimitUsageReader,
  setLimitsClock,
  __resetLimits,
} from './limits.js'
export { floatStream, firstFloat, firstUint32, hashServerSeed, uniformSample } from './fair.js'
