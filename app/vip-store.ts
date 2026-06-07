/**
 * The VIP store — the live, persisted state for VIP ranks + leaderboard +
 * free-play. Same pattern as app/book-store.ts: a framework-agnostic external
 * store (subscribe / version snapshot) mirrored into React with
 * `useSyncExternalStore`, persisted via `persistedDoc` under namespace 'dimebag'.
 *
 * It subscribes to `core`'s `onWagerResolved` so EVERY settled wager accrues to
 * the player's lifetime `wagered`, and (when auto-grant is on) reached rank
 * rewards land in their free-play pool. Money still only ever flows through
 * `core`: this store never calls placeWager/resolveWager and never touches a core
 * Account.balance. Redeeming free play (which DOES credit the core balance) is the
 * app integration's job — `takeFreePlay` just hands it the cents to credit.
 */

import { onWagerResolved } from '../core/index.js'
import { createLocalStore, persistedDoc, type Doc } from '../persistence/index.js'
import {
  defaultVipConfig,
  grantRewards,
  leaderboardRows,
  type LeaderboardRow,
  type PlayerVip,
  type VipConfig,
} from '../vip/index.js'

/* ----------------------------- persistence ------------------------------ */

const store = createLocalStore({ namespace: 'dimebag' })
const CONFIG_DOC: Doc<VipConfig> = persistedDoc<VipConfig>(store, 'vip.config', {
  version: 1,
  initial: defaultVipConfig(),
})
const PLAYERS_DOC: Doc<Record<string, PlayerVip>> = persistedDoc<Record<string, PlayerVip>>(
  store,
  'vip.players',
  { version: 1, initial: {} },
)

/* ------------------------------ live state ------------------------------ */

const config: VipConfig = CONFIG_DOC.load()
const players: Record<string, PlayerVip> = PLAYERS_DOC.load()
const listeners = new Set<() => void>()
// State is mutated IN PLACE (stable references), so a version counter gives
// useSyncExternalStore a changing snapshot to re-render on.
let version = 0

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

function persist(): void {
  CONFIG_DOC.save(config)
  PLAYERS_DOC.save(players)
}

/** Ensure (and return) a player's VIP record, creating a zeroed one if absent. */
function ensure(id: string): PlayerVip {
  let pv = players[id]
  if (!pv) {
    pv = { wagered: 0, claimedRanks: [], freePlay: 0 }
    players[id] = pv
  }
  return pv
}

/* --------------------------- play → accrue ------------------------------ */

// Every settled wager (any game, the sportsbook) accrues to the player's lifetime
// wagered, and — when auto-grant is on — lands any newly reached rank reward in
// their free-play pool. Registered once on import. A subscriber must never break
// settlement, but core already isolates listener errors.
onWagerResolved((e) => {
  const pv = ensure(e.accountId)
  pv.wagered += e.stake
  if (config.autoGrant) grantRewards(pv, config)
  persist()
  notify()
})

/* -------------------------------- the API ------------------------------- */

/** Subscribe to any VIP-state change (for useSyncExternalStore). */
export function subscribeVip(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A monotonically increasing snapshot for useSyncExternalStore. */
export function getVipVersion(): number {
  return version
}

/** The live program config. Stable reference — mutated in place. */
export function getVipConfig(): VipConfig {
  return config
}

/** A player's VIP record, ensuring (and persisting) a zeroed entry if absent. */
export function getPlayerVip(id: string): PlayerVip {
  return ensure(id)
}

/**
 * Leaderboard rows for the given players: pulls each player's VIP record, builds
 * entries, and sorts/positions/tags them via `leaderboardRows`.
 */
export function leaderboard(playersIn: { id: string; name: string }[]): LeaderboardRow[] {
  const entries = playersIn.map((p) => {
    const pv = ensure(p.id)
    return { id: p.id, name: p.name, wagered: pv.wagered, freePlay: pv.freePlay }
  })
  return leaderboardRows(entries, config)
}

/**
 * Apply a mutation to the program config (release toggle, re-price, etc.), then —
 * when auto-grant is on — re-run reward granting for every known player so that
 * lowering a threshold immediately grants the newly reached rewards. Persists +
 * notifies. Errors propagate to the caller; nothing is saved on a throw.
 */
export function mutateVipConfig(fn: (c: VipConfig) => void): void {
  fn(config)
  if (config.autoGrant) {
    for (const id of Object.keys(players)) grantRewards(players[id], config)
  }
  persist()
  notify()
}

/**
 * Redeem a player's free play: zero their pool and return the cents taken so the
 * app integration can credit the player's core Account.balance with it. Persists
 * + notifies. (This module never touches the core balance itself.)
 */
export function takeFreePlay(playerId: string): number {
  const pv = ensure(playerId)
  const cents = pv.freePlay
  pv.freePlay = 0
  persist()
  notify()
  return cents
}

/** A manual manager grant of free play (cents) to a player. Persists + notifies. */
export function grantFreePlay(playerId: string, cents: number): void {
  const pv = ensure(playerId)
  pv.freePlay += cents
  persist()
  notify()
}
