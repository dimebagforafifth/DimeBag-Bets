/**
 * The gamification engine — a persisted singleton tying the operator config to each
 * player's progress, and the one place rewards are paid.
 *
 *  - PROGRESS is real-time: it subscribes to core's `onWagerResolved` (public interface)
 *    and advances XP / missions / achievements / tournament scores as bets settle. No
 *    money moves here (the event carries an id, not the Account).
 *  - PAYOUTS take the player's `Account` and pay free-play via `rewards.payFreePlay`
 *    (→ core.grant — the VIP free-play path). Every payout is idempotent: a claimed
 *    mission/achievement, a wheel on cooldown, or an already-paid tournament never pays
 *    twice. The player UI auto-claims on the settling render, so rewards land in-session.
 *
 * Config + state persist via the shared persistence module; money still flows only
 * through core. Same subscribe/version snapshot shape as the other stores.
 */

import { createLocalStore, persistedDoc, type Doc } from '../../persistence/index.js'
import { onWagerResolved, type Account, type Outcome, type ResolveEvent } from '../../core/index.js'
import { defaultGamificationConfig } from './config.js'
import { advanceMission, currentProgress, type PlayEvent } from './missions.js'
import { newlyUnlocked } from './achievements.js'
import { XP_PER_BET } from './xp.js'
import { hasEnded, isLive, standings, type TournamentEntry } from './tournaments.js'
import { spin } from './wheel.js'
import { payFreePlay } from './rewards.js'
import type {
  GamificationConfig,
  MissionDef,
  MissionProgress,
  PlayerState,
  RewardResult,
  TournamentStanding,
  WheelSegment,
} from './types.js'

const HOUR_MS = 3_600_000
const store = createLocalStore({ namespace: 'dimebag' })

const CONFIG_DOC: Doc<GamificationConfig> = persistedDoc(store, 'gamification.config', {
  version: 1,
  initial: defaultGamificationConfig(),
})
const STATE_DOC: Doc<Record<string, PlayerState>> = persistedDoc(store, 'gamification.players', {
  version: 1,
  initial: {},
})

let config: GamificationConfig = CONFIG_DOC.load()
let players: Record<string, PlayerState> = STATE_DOC.load()
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}
function persist(): void {
  CONFIG_DOC.save(config)
  STATE_DOC.save(players)
}

function freshPlayer(id: string): PlayerState {
  return {
    id,
    xp: 0,
    lifetimeBets: 0,
    lifetimeWagered: 0,
    lifetimeWins: 0,
    missions: {},
    achievements: {},
    wheelLastSpinAt: null,
    tournamentScores: {},
    tournamentPaid: {},
  }
}
function ensurePlayer(id: string): PlayerState {
  let p = players[id]
  if (!p) {
    p = freshPlayer(id)
    players[id] = p
  }
  return p
}

/* ----------------------------- progress (no money) ----------------------- */

/** Advance a player's progress from one resolved bet. Exported for tests; also driven
 *  by the onWagerResolved subscription below. Moves no money. */
export function recordPlay(
  accountId: string,
  ev: { stake: number; profit: number; outcome: Outcome },
  now: number,
): void {
  const p = ensurePlayer(accountId)
  const win = ev.outcome === 'win' ? 1 : 0
  const play: PlayEvent = { bets: 1, wagered: Math.max(0, ev.stake), wins: win }

  p.lifetimeBets += 1
  p.lifetimeWagered += play.wagered
  p.lifetimeWins += win
  p.xp += XP_PER_BET

  for (const def of config.missions) {
    if (!def.enabled) continue
    p.missions[def.id] = advanceMission(p.missions[def.id], def, play, now)
  }
  for (const t of config.tournaments) {
    if (!isLive(t, now)) continue
    const delta = t.metric === 'wagered' ? play.wagered : t.metric === 'wins' ? win : ev.profit
    p.tournamentScores[t.id] = (p.tournamentScores[t.id] ?? 0) + delta
  }
  for (const def of newlyUnlocked(config.achievements, p)) {
    p.achievements[def.id] = { unlockedAt: now, claimed: false }
  }
  persist()
  notify()
}

// Real-time: every resolved wager (any game/the sportsbook) advances that player's
// gamification progress. Read-only w.r.t. the account; pure bookkeeping.
onWagerResolved((e: ResolveEvent) => {
  recordPlay(e.accountId, { stake: e.stake, profit: e.profit, outcome: e.outcome }, Date.now())
})

/* ------------------------------- payouts (money) ------------------------- */

/**
 * Pay out every claimable mission + achievement for the player — free-play via core.
 * Idempotent: a second call with nothing newly claimable grants 0 and is a no-op.
 */
export function claimRewards(account: Account, now: number = Date.now()): RewardResult {
  const p = ensurePlayer(account.id)
  let cents = 0
  let xp = 0
  const items: string[] = []

  for (const def of config.missions) {
    const mp = p.missions[def.id]
    if (mp && mp.completedAt !== null && !mp.claimed) {
      mp.claimed = true
      const paid = payFreePlay(account, def.rewardCents, { source: 'mission', detail: def.id })
      cents += paid
      xp += def.xp
      p.xp += def.xp
      items.push(`Mission “${def.title}”`)
    }
  }
  for (const def of config.achievements) {
    const as = p.achievements[def.id]
    if (as && !as.claimed) {
      as.claimed = true
      const paid = payFreePlay(account, def.rewardCents, { source: 'achievement', detail: def.id })
      cents += paid
      xp += def.xp
      p.xp += def.xp
      items.push(`${def.badge} ${def.title}`)
    }
  }
  // Claimed XP can cross a level threshold → record any newly-earned level achievements
  // (paid on the next claim). Keeps level badges from being stranded.
  for (const def of newlyUnlocked(config.achievements, p)) {
    p.achievements[def.id] = { unlockedAt: now, claimed: false }
  }

  if (cents > 0 || xp > 0) {
    persist()
    notify()
  }
  return { cents, xp, items }
}

export interface WheelResult {
  segment: WheelSegment
  cents: number
}

/** Whether the player may spin now (wheel enabled + cooldown elapsed). */
export function canSpin(accountId: string, now: number = Date.now()): boolean {
  if (!config.wheel.enabled || config.wheel.segments.length === 0) return false
  const last = players[accountId]?.wheelLastSpinAt
  return last == null || now - last >= config.wheel.cooldownHours * HOUR_MS
}

/** When the player may next spin (epoch ms), or 0 if they can spin now. */
export function nextSpinAt(accountId: string, now: number = Date.now()): number {
  const last = players[accountId]?.wheelLastSpinAt
  if (last == null) return 0
  const ready = last + config.wheel.cooldownHours * HOUR_MS
  return ready > now ? ready : 0
}

/**
 * Spin the daily wheel for `account`: a provably-fair weighted pick, paid as free-play.
 * Returns null if the player is on cooldown / the wheel is off (so it can never double-
 * award within a cooldown). Tests may inject the seed triple for determinism.
 */
export function spinWheel(
  account: Account,
  opts: { now?: number; serverSeed?: string; clientSeed?: string; nonce?: number } = {},
): WheelResult | null {
  const now = opts.now ?? Date.now()
  const p = ensurePlayer(account.id)
  if (!canSpin(account.id, now)) return null

  const serverSeed = opts.serverSeed ?? `${now}-${Math.random()}`
  const clientSeed = opts.clientSeed ?? account.id
  const nonce = opts.nonce ?? now
  const segment = spin(config.wheel.segments, serverSeed, clientSeed, nonce)

  p.wheelLastSpinAt = now // stamp BEFORE paying so a re-entrant call is on cooldown
  const cents = payFreePlay(account, segment.rewardCents, { source: 'wheel', detail: segment.label })
  persist()
  notify()
  return { segment, cents }
}

function tournamentEntries(tournamentId: string, names: Record<string, string> = {}): TournamentEntry[] {
  return Object.values(players)
    .filter((p) => p.tournamentScores[tournamentId] !== undefined)
    .map((p) => ({ id: p.id, name: names[p.id] ?? p.id, score: p.tournamentScores[tournamentId] ?? 0 }))
}

/** Ranked standings for a tournament (names injected by the caller from the book). */
export function tournamentStandings(
  tournamentId: string,
  names: Record<string, string> = {},
): TournamentStanding[] {
  const def = config.tournaments.find((t) => t.id === tournamentId)
  if (!def) return []
  return standings(tournamentEntries(tournamentId, names), def)
}

export interface TournamentPayout {
  id: string
  position: number
  prizeCents: number
}

/**
 * Settle a tournament: rank its scores, pay each in-the-money player whose Account is
 * supplied (free-play via core), and mark them paid. Idempotent per player — a second
 * settle pays nobody twice. A winner whose account isn't supplied is simply skipped
 * (not marked paid), so they can be paid on a later call.
 */
export function settleTournament(
  tournamentId: string,
  accounts: Record<string, Account>,
  _now: number = Date.now(), // reserved for paid-at stamping; unused today
): TournamentPayout[] {
  const def = config.tournaments.find((t) => t.id === tournamentId)
  if (!def) throw new Error(`unknown tournament ${tournamentId}`)
  const ranked = standings(tournamentEntries(tournamentId), def)
  const payouts: TournamentPayout[] = []
  for (const row of ranked) {
    if (row.prizeCents <= 0) continue
    const p = players[row.id]
    if (!p || p.tournamentPaid[def.id]) continue
    const account = accounts[row.id]
    if (!account) continue
    p.tournamentPaid[def.id] = true
    const cents = payFreePlay(account, row.prizeCents, { source: 'tournament', detail: def.id })
    payouts.push({ id: row.id, position: row.position, prizeCents: cents })
  }
  if (payouts.length) {
    persist()
    notify()
  }
  return payouts
}

/** True once a tournament's window has closed. */
export function tournamentEnded(tournamentId: string, now: number = Date.now()): boolean {
  const def = config.tournaments.find((t) => t.id === tournamentId)
  return def ? hasEnded(def, now) : false
}

/* ------------------------------- reads ---------------------------------- */

export function subscribeGamification(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getGamificationVersion(): number {
  return version
}
export function getConfig(): GamificationConfig {
  return config
}
export function getPlayerState(id: string): PlayerState {
  return players[id] ?? freshPlayer(id)
}

/** A player's enabled missions with their CURRENT-period progress (refreshed). */
export function playerMissions(id: string, now: number = Date.now()): Array<{ def: MissionDef; progress: MissionProgress }> {
  const p = players[id]
  return config.missions
    .filter((d) => d.enabled)
    .map((def) => ({ def, progress: currentProgress(p?.missions[def.id], def, now) }))
}

/* ------------------------- config mutation (operator) -------------------- */

/** Mutate the config in place, then persist + notify. Used by the operator pages. */
export function updateConfig(fn: (c: GamificationConfig) => void): void {
  fn(config)
  persist()
  notify()
}

const intOrThrow = (n: number, label: string): number => {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} must be a whole number ≥ 0, got ${n}`)
  return n
}

export function setWheelSegment(id: string, patch: Partial<Pick<WheelSegment, 'label' | 'rewardCents' | 'weight'>>): void {
  updateConfig((c) => {
    const seg = c.wheel.segments.find((s) => s.id === id)
    if (!seg) throw new Error(`unknown wheel segment ${id}`)
    if (patch.label !== undefined) seg.label = patch.label
    if (patch.rewardCents !== undefined) seg.rewardCents = intOrThrow(patch.rewardCents, 'reward')
    if (patch.weight !== undefined) {
      if (!(patch.weight >= 0) || !Number.isFinite(patch.weight)) throw new Error(`weight must be ≥ 0, got ${patch.weight}`)
      seg.weight = patch.weight
    }
  })
}
export function setWheelEnabled(on: boolean): void {
  updateConfig((c) => {
    c.wheel.enabled = on
  })
}
export function setWheelCooldownHours(hours: number): void {
  updateConfig((c) => {
    if (!(hours > 0) || !Number.isFinite(hours)) throw new Error(`cooldown must be > 0 hours, got ${hours}`)
    c.wheel.cooldownHours = hours
  })
}

export function setMission(id: string, patch: Partial<Pick<MissionDef, 'enabled' | 'target' | 'rewardCents' | 'xp'>>): void {
  updateConfig((c) => {
    const m = c.missions.find((x) => x.id === id)
    if (!m) throw new Error(`unknown mission ${id}`)
    if (patch.enabled !== undefined) m.enabled = patch.enabled
    if (patch.target !== undefined) m.target = intOrThrow(patch.target, 'target') || 1
    if (patch.rewardCents !== undefined) m.rewardCents = intOrThrow(patch.rewardCents, 'reward')
    if (patch.xp !== undefined) m.xp = intOrThrow(patch.xp, 'xp')
  })
}

export function setAchievement(
  id: string,
  patch: Partial<Pick<import('./types.js').AchievementDef, 'enabled' | 'threshold' | 'rewardCents' | 'xp'>>,
): void {
  updateConfig((c) => {
    const a = c.achievements.find((x) => x.id === id)
    if (!a) throw new Error(`unknown achievement ${id}`)
    if (patch.enabled !== undefined) a.enabled = patch.enabled
    if (patch.threshold !== undefined) a.threshold = intOrThrow(patch.threshold, 'threshold') || 1
    if (patch.rewardCents !== undefined) a.rewardCents = intOrThrow(patch.rewardCents, 'reward')
    if (patch.xp !== undefined) a.xp = intOrThrow(patch.xp, 'xp')
  })
}

export function setTournament(
  id: string,
  patch: Partial<Pick<import('./types.js').TournamentDef, 'enabled' | 'prizePoolCents' | 'startsAt' | 'endsAt'>>,
): void {
  updateConfig((c) => {
    const t = c.tournaments.find((x) => x.id === id)
    if (!t) throw new Error(`unknown tournament ${id}`)
    if (patch.enabled !== undefined) t.enabled = patch.enabled
    if (patch.prizePoolCents !== undefined) t.prizePoolCents = intOrThrow(patch.prizePoolCents, 'prize pool')
    if (patch.startsAt !== undefined) t.startsAt = patch.startsAt
    if (patch.endsAt !== undefined) t.endsAt = patch.endsAt
  })
}

/** Test helper: restore defaults + clear all player progress. */
export function __resetGamification(): void {
  config = defaultGamificationConfig()
  players = {}
  persist()
  notify()
}
