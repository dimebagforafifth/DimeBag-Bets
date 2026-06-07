/**
 * VIP program logic — pure functions over a `VipConfig` and per-player
 * `PlayerVip` state. No money moves here: this layer only derives ranks /
 * progress / leaderboard rows and tracks free-play owed. Redeeming free play
 * (which credits a player's core Account.balance) is the app integration's job.
 *
 * Everything is integer CENTS. Functions that mutate do so in place (noted on
 * each), mirroring how `core` mutates an Account.
 */

import { RANK_ORDER, defaultRanks } from './ranks.js'
import type { LeaderboardRow, PlayerVip, RankDef, RankId, RankProgress, VipConfig } from './types.js'

/** A fresh program config: not yet released, auto-grant on, default ladder. */
export function defaultVipConfig(): VipConfig {
  return { released: false, autoGrant: true, ranks: defaultRanks() }
}

/** Index of a rank id in the canonical ladder order. */
function orderIndex(id: RankId): number {
  return RANK_ORDER.indexOf(id)
}

/** The ladder sorted by canonical order (defensive — config.ranks should already be). */
function ladder(config: VipConfig): RankDef[] {
  return [...config.ranks].sort((a, b) => orderIndex(a.id) - orderIndex(b.id))
}

/** Find a rank def by id (throws if the config is missing it). */
function rankDef(config: VipConfig, id: RankId): RankDef {
  const def = config.ranks.find((r) => r.id === id)
  if (!def) throw new Error(`unknown rank ${id}`)
  return def
}

/**
 * The highest rank whose `minWagered` is ≤ `wagered`. Walks the ladder from the
 * top down so re-priced thresholds are honoured; falls back to the lowest rung.
 */
export function rankFor(wagered: number, config: VipConfig): RankDef {
  const order = ladder(config)
  for (let i = order.length - 1; i >= 0; i--) {
    if (wagered >= order[i].minWagered) return order[i]
  }
  return order[0]
}

/**
 * A player's standing toward the next rung. `pct` is 0..1 across the gap between
 * the current rank's threshold and the next rank's threshold; at the top rank
 * `next` is null, `pct` is 1 and `remaining` is 0.
 */
export function rankProgress(wagered: number, config: VipConfig): RankProgress {
  const order = ladder(config)
  const current = rankFor(wagered, config)
  const idx = order.findIndex((r) => r.id === current.id)
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null

  if (!next) {
    return { current, next: null, pct: 1, remaining: 0 }
  }

  const span = next.minWagered - current.minWagered
  const done = wagered - current.minWagered
  const pct = span <= 0 ? 1 : Math.min(1, Math.max(0, done / span))
  const remaining = Math.max(0, next.minWagered - wagered)
  return { current, next, pct, remaining }
}

/**
 * Build sorted leaderboard rows from raw entries: sorted by `wagered` desc, each
 * tagged with its 1-based position, current rank, and free-play balance.
 */
export function leaderboardRows(
  entries: { id: string; name: string; wagered: number; freePlay: number }[],
  config: VipConfig,
): LeaderboardRow[] {
  return [...entries]
    .sort((a, b) => b.wagered - a.wagered)
    .map((e, i) => ({
      position: i + 1,
      id: e.id,
      name: e.name,
      wagered: e.wagered,
      rank: rankFor(e.wagered, config),
      freePlay: e.freePlay,
    }))
}

/**
 * Ranks the player has REACHED (minWagered ≤ wagered) that still owe a reward:
 * not yet in `claimedRanks` and carrying a positive `freePlayReward`.
 */
export function unclaimedRewards(pv: PlayerVip, config: VipConfig): RankDef[] {
  return ladder(config).filter(
    (r) =>
      r.minWagered <= pv.wagered && r.freePlayReward > 0 && !pv.claimedRanks.includes(r.id),
  )
}

/**
 * Grant every unclaimed reached reward: mark each rank claimed and add its
 * `freePlayReward` to `pv.freePlay`. Mutates `pv` in place and returns the total
 * cents granted. IDEMPOTENT — a second call (nothing left unclaimed) returns 0.
 */
export function grantRewards(pv: PlayerVip, config: VipConfig): number {
  const due = unclaimedRewards(pv, config)
  let total = 0
  for (const r of due) {
    pv.claimedRanks.push(r.id)
    pv.freePlay += r.freePlayReward
    total += r.freePlayReward
  }
  return total
}

/** Toggle whether the program is released to players. Mutates in place. */
export function setReleased(config: VipConfig, released: boolean): void {
  config.released = released
}

/** Toggle automatic reward granting. Mutates in place. */
export function setAutoGrant(config: VipConfig, autoGrant: boolean): void {
  config.autoGrant = autoGrant
}

/**
 * Re-price a rank's wagered threshold (cents). Must be a non-negative integer,
 * and must keep thresholds non-decreasing along the ladder — throws rather than
 * let a higher rung become easier than a lower one (which would corrupt rankFor).
 */
export function setRankMinWagered(config: VipConfig, id: RankId, cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`minWagered must be a non-negative integer, got ${cents}`)
  }
  const order = ladder(config)
  const idx = order.findIndex((r) => r.id === id)
  if (idx < 0) throw new Error(`unknown rank ${id}`)
  const prev = idx > 0 ? order[idx - 1].minWagered : -Infinity
  const next = idx < order.length - 1 ? order[idx + 1].minWagered : Infinity
  if (cents < prev || cents > next) {
    throw new Error(
      `minWagered ${cents} for ${id} breaks ladder monotonicity (must be between ${prev} and ${next})`,
    )
  }
  rankDef(config, id).minWagered = cents
}

/** Re-price a rank's free-play reward (cents). Must be a non-negative integer. */
export function setRankReward(config: VipConfig, id: RankId, cents: number): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`freePlayReward must be a non-negative integer, got ${cents}`)
  }
  rankDef(config, id).freePlayReward = cents
}
