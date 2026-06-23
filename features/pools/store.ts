/**
 * The pools/leagues store — the one list of pools + entries + invites + league seasons the app
 * runs on, plus the lifecycle that routes ALL money through core (escrow.ts):
 *
 *   create → open → (lock at lock_at) → locked → (post results) → scoring → (settle) → settled
 *                                     └─ under-filled / cancelled ─────────────────→ void (refund)
 *
 * Money moves ONLY at enter (hold), settle (collect → grant prizes + rake) and void (refund),
 * all through core; standings are pure read-only projections (standings.ts). Pool/entry/invite/
 * league METADATA is persisted (localStorage default, Supabase when keyed); the live entry-fee
 * holds are in-memory {account,wager} refs and clear on reload, exactly like pickem/events.
 */

import { createStore, persistedDoc, getActiveTenant, type Doc } from '../../persistence/index.js'
import { getBook } from '../../app/book-store.js'
import { getViewer } from '../../app/viewer.js'
import type { Account } from '../../core/index.js'
// SEAM (Lane A): privacy='friends' gates a pool to the creator's follow graph. Lane A repoints
// social.followingOf at its projection follow-graph; importing from the social barrel keeps the
// swap transparent. 'friends' = the people the creator follows (their outbound graph).
import { followingOf } from '../social/index.js'
import { formatFor } from './formats/index.js'
import { poolWinners } from './standings.js'
import { holdEntryFee, settlePoolMoney, voidPoolMoney, type EntryHold } from './escrow.js'
import { getPoolsPolicy, poolCreationAllowed } from './policy.js'
import type { PoolConfig, PoolPicks, PoolResults } from './formats/types.js'
import type {
  LeagueSeason,
  Pool,
  PoolEntry,
  PoolInvite,
  PoolKind,
  PoolPayout,
  PoolPrivacy,
  PoolScope,
} from './types.js'

interface PoolsState {
  seq: number
  pools: Pool[]
  entries: PoolEntry[]
  invites: PoolInvite[]
  leagues: LeagueSeason[]
}

const INITIAL: PoolsState = { seq: 0, pools: [], entries: [], invites: [], leagues: [] }

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<PoolsState> = persistedDoc<PoolsState>(store, 'pools.state', {
  version: 1,
  initial: INITIAL,
})

let state: PoolsState = DOC.load() ?? INITIAL
let version = 0
const listeners = new Set<() => void>()

/** Live core refs for open entry holds (account + the held wager). In-memory; clears on reload. */
const live = new Map<string, EntryHold>()

function notify(): void {
  DOC.save(state)
  version += 1
  for (const l of listeners) l()
}
function nextId(prefix: string): string {
  state.seq += 1
  return `${prefix}-${state.seq}`
}
function accountOf(accountId: string): Account | undefined {
  return getBook().members[accountId]?.account
}
function operatorAccount(): Account | undefined {
  const book = getBook()
  return book.members[book.managerId]?.account
}
function nameOf(accountId: string): string {
  return (
    state.entries.find((e) => e.accountId === accountId)?.playerName ??
    getBook().members[accountId]?.name ??
    accountId
  )
}

/* --------------------------------- reads --------------------------------- */

export function subscribePools(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function poolsVersion(): number {
  return version
}
export function getPools(): Pool[] {
  return state.pools
}
export function getPool(id: string): Pool | undefined {
  return state.pools.find((p) => p.id === id)
}
export function entriesForPool(poolId: string): PoolEntry[] {
  return state.entries.filter((e) => e.poolId === poolId)
}
export function entriesForAccount(accountId: string): PoolEntry[] {
  return state.entries.filter((e) => e.accountId === accountId)
}
export function isEntered(poolId: string, accountId: string): boolean {
  return state.entries.some((e) => e.poolId === poolId && e.accountId === accountId)
}
export function invitesForPool(poolId: string): PoolInvite[] {
  return state.invites.filter((i) => i.poolId === poolId)
}
export function getLeague(id: string): LeagueSeason | undefined {
  return state.leagues.find((l) => l.id === id)
}
export function leagueForPool(poolId: string): LeagueSeason | undefined {
  return state.leagues.find((l) => l.poolId === poolId)
}

/** Privacy gate: can `viewerId` see + join this pool? The creator always can. */
export function canJoinPool(pool: Pool, viewerId: string): boolean {
  if (viewerId === pool.creatorId) return true
  switch (pool.privacy) {
    case 'public':
      return true
    case 'friends':
      return followingOf(pool.creatorId).includes(viewerId)
    case 'invite':
      return state.invites.some((i) => i.poolId === pool.id && i.playerId === viewerId)
    default:
      return false
  }
}

/** Pools visible to a viewer (privacy-filtered; demo pools always show). */
export function visiblePools(viewerId: string): Pool[] {
  return state.pools.filter((p) => p.demo || canJoinPool(p, viewerId))
}

/* ------------------------------- authoring ------------------------------- */

export interface CreatePoolInput {
  creatorId: string
  creatorName: string
  /** True when created by an operator/manager (skips the player-pool policy gate). */
  creatorIsOperator: boolean
  name: string
  kind: PoolKind
  scope: PoolScope
  privacy: PoolPrivacy
  entryCents: number
  maxEntries: number | null
  minEntries: number
  guaranteedCents: number
  prizeStructure: number[]
  rakeBps?: number
  config: PoolConfig
  lockAt: number
  now: number
}

const isInt = (n: number): boolean => Number.isInteger(n)

/** Validate + create a pool (opens for entries). Throws on a bad spec or a policy violation;
 *  mutates nothing until valid. */
export function createPool(input: CreatePoolInput): Pool {
  const policy = getPoolsPolicy()
  const name = input.name.trim()
  if (!name) throw new Error('a pool needs a name')
  if (input.config.kind !== input.kind) throw new Error('config kind must match the pool kind')
  formatFor(input.kind).validateConfig(input.config) // throws for 'prop' / malformed config

  if (!isInt(input.entryCents) || input.entryCents < 0)
    throw new Error('entry fee must be whole cents ≥ 0')
  if (!isInt(input.guaranteedCents) || input.guaranteedCents < 0)
    throw new Error('guarantee must be whole cents ≥ 0')
  if (!Number.isFinite(input.lockAt)) throw new Error('lock_at must be an epoch-ms timestamp')
  if (!isInt(input.minEntries) || input.minEntries < 0) throw new Error('min entries must be ≥ 0')
  if (input.maxEntries !== null && (!isInt(input.maxEntries) || input.maxEntries < 1))
    throw new Error('max entries must be a positive integer or null')
  if (input.maxEntries !== null && input.minEntries > input.maxEntries)
    throw new Error('min entries cannot exceed max entries')
  const splitSum = input.prizeStructure.reduce((a, b) => a + b, 0)
  if (input.prizeStructure.some((f) => f < 0) || splitSum > 1 + 1e-9)
    throw new Error('prize structure fractions must be ≥ 0 and sum ≤ 1')

  // Policy gate for PLAYER-created pools (operators are bound only by the hard caps above).
  if (!input.creatorIsOperator) {
    if (!poolCreationAllowed(false)) throw new Error('player-created pools are currently disabled')
    if (!policy.allowedFormats.includes(input.kind))
      throw new Error(`the ${input.kind} format isn’t allowed`)
    if (policy.maxEntryCents > 0 && input.entryCents > policy.maxEntryCents)
      throw new Error('entry fee exceeds the operator cap')
    if (
      policy.maxEntries !== null &&
      (input.maxEntries === null || input.maxEntries > policy.maxEntries)
    )
      throw new Error('max entries exceeds the operator cap')
  }

  // Rake: players inherit the operator default; operators may set up to the ceiling.
  const requested = input.creatorIsOperator ? (input.rakeBps ?? policy.rakeBps) : policy.rakeBps
  const rakeBps = Math.min(Math.max(0, Math.trunc(requested)), policy.maxRakeBps)

  const pool: Pool = {
    id: nextId('pool'),
    tenantId: getActiveTenant(),
    creatorId: input.creatorId,
    creatorName: input.creatorName,
    name,
    kind: input.kind,
    scope: input.scope,
    privacy: input.privacy,
    entryCents: input.entryCents,
    maxEntries: input.maxEntries,
    minEntries: input.minEntries,
    guaranteedCents: input.guaranteedCents,
    prizeStructure: [...input.prizeStructure],
    rakeBps,
    config: input.config,
    lifecycle: 'open',
    lockAt: input.lockAt,
    createdAt: input.now,
  }
  state = { ...state, pools: [...state.pools, pool] }
  notify()
  return pool
}

/* ------------------------------- entering -------------------------------- */

export interface EnterPoolInput {
  poolId: string
  account: Account
  playerName: string
  picks: PoolPicks
  now: number
}

/** Enter a pool: validate the picks, hold the entry fee through core, record the entry. Nothing
 *  is recorded unless the hold succeeds, so a rejected fee leaves no orphan entry. */
export function enterPool(input: EnterPoolInput): PoolEntry {
  const pool = getPool(input.poolId)
  if (!pool) throw new Error('no such pool')
  if (pool.demo) throw new Error('this is a sample pool and is not joinable')
  if (pool.lifecycle !== 'open') throw new Error('entries are closed for this pool')
  if (input.now >= pool.lockAt) throw new Error('picks are locked for this pool')
  if (!canJoinPool(pool, input.account.id)) throw new Error('this pool is private')
  if (isEntered(pool.id, input.account.id)) throw new Error('already entered')
  const existing = entriesForPool(pool.id)
  if (pool.maxEntries !== null && existing.length >= pool.maxEntries)
    throw new Error('this pool is full')

  formatFor(pool.kind).validatePicks(input.picks, pool.config)
  // Squares: a square can be held by only one entry — enforce cross-entry uniqueness here.
  if (pool.kind === 'squares' && input.picks.kind === 'squares') {
    const taken = new Set<string>()
    for (const e of existing) {
      if (e.picks.kind === 'squares')
        for (const s of e.picks.squares) taken.add(`${s.row},${s.col}`)
    }
    for (const s of input.picks.squares) {
      if (taken.has(`${s.row},${s.col}`))
        throw new Error(`square ${s.row},${s.col} is already taken`)
    }
  }

  const wager = holdEntryFee(input.account, pool.entryCents)
  const entry: PoolEntry = {
    id: nextId('entry'),
    poolId: pool.id,
    accountId: input.account.id,
    playerName: input.playerName,
    joinedAt: input.now,
    wager,
    stakeCents: pool.entryCents,
    picks: input.picks,
  }
  if (wager) live.set(entry.id, { accountId: input.account.id, account: input.account, wager })
  state = { ...state, entries: [...state.entries, entry] }
  notify()
  return entry
}

/* ------------------------------- lifecycle ------------------------------- */

function setLifecycle(pool: Pool, lifecycle: Pool['lifecycle']): void {
  pool.lifecycle = lifecycle
}

/** Open entry holds for a pool (live refs; absent after a reload). */
function holdsFor(poolId: string): EntryHold[] {
  const out: EntryHold[] = []
  for (const e of entriesForPool(poolId)) {
    const h = live.get(e.id)
    if (h && h.wager.status === 'open') out.push(h)
  }
  return out
}

/** Lock a pool at/after lock_at — picks freeze. Under-filled (entrants < minEntries) → void+refund. */
export function lockPool(id: string, now: number): Pool {
  const pool = getPool(id)
  if (!pool) throw new Error('no such pool')
  if (pool.demo) throw new Error('demo pools are display-only')
  if (pool.lifecycle !== 'open') throw new Error('pool is not open')
  if (now < pool.lockAt) throw new Error('pool cannot lock before lock_at')
  if (entriesForPool(id).length < pool.minEntries) {
    return voidPool(id, 'under-filled', now)
  }
  setLifecycle(pool, 'locked')
  state = { ...state }
  notify()
  return pool
}

/** Merge newly-posted results into the pool's accumulating results (handles per-week league rounds). */
function mergeResults(prev: PoolResults | undefined, next: PoolResults): PoolResults {
  if (!prev || prev.kind !== next.kind) return next
  switch (next.kind) {
    case 'pickem':
    case 'confidence':
    case 'bracket':
      return { ...next, winners: { ...(prev as typeof next).winners, ...next.winners } }
    case 'survivor':
      return {
        kind: 'survivor',
        roundWinners: { ...(prev as typeof next).roundWinners, ...next.roundWinners },
      }
    case 'squares': {
      // Key by period so a corrected re-post of a period REPLACES it (last-write-wins) rather than
      // appending a duplicate — appending would double-count that period's weight and overpay.
      const byPeriod = new Map<number, { period: number; home: number; away: number }>()
      for (const ps of (prev as typeof next).periodScores) byPeriod.set(ps.period, ps)
      for (const ps of next.periodScores) byPeriod.set(ps.period, ps)
      return { kind: 'squares', periodScores: [...byPeriod.values()] }
    }
    default:
      return next
  }
}

/** Post (or accumulate) results — moves the pool into 'scoring'. Operator/result-driven. */
export function postResults(id: string, results: PoolResults, now: number): Pool {
  const pool = getPool(id)
  if (!pool) throw new Error('no such pool')
  if (pool.demo) throw new Error('demo pools are display-only')
  if (pool.lifecycle !== 'locked' && pool.lifecycle !== 'scoring')
    throw new Error('results can only be posted once a pool is locked')
  pool.results = mergeResults(pool.results, results)
  setLifecycle(pool, 'scoring')
  void now
  state = { ...state }
  notify()
  return pool
}

/**
 * Settle a scoring pool: collect every held fee into the pool, split it by the conserving
 * allocator, grant prizes + the rake through core, and FREEZE the result. Idempotent-guarded.
 */
export function settlePool(id: string, now: number): Pool {
  const pool = getPool(id)
  if (!pool) throw new Error('no such pool')
  if (pool.demo) throw new Error('demo pools are display-only and cannot be settled')
  if (pool.lifecycle !== 'scoring') throw new Error('post results before settling')
  if (!pool.results) throw new Error('no results posted')

  const entries = entriesForPool(id)
  const holds = holdsFor(id)
  // The entry-fee holds live in memory and are cleared on reload (book-store sanitize also refunds
  // the pending). Settling then would collect nothing and pay only the guarantee off phantom-funded
  // entries — refuse it loudly so the operator voids (clean, balances already restored) instead.
  const feeBearing = entries.filter((e) => e.stakeCents > 0)
  if (feeBearing.length > 0 && holds.length < feeBearing.length) {
    throw new Error('pool holds were reset (likely a reload) — void this pool instead of settling')
  }
  const winners = poolWinners(pool, entries, pool.results)
  const result = settlePoolMoney({
    poolId: pool.id,
    guaranteedCents: pool.guaranteedCents,
    rakeBps: pool.rakeBps,
    holds,
    winners,
    accountOf,
    operatorAccount: operatorAccount(),
  })

  const payouts: PoolPayout[] = result.payouts
    .map((p, i) => ({
      accountId: p.accountId,
      name: nameOf(p.accountId),
      rank: i + 1,
      prizeCents: p.prizeCents,
    }))
    .sort((a, b) => b.prizeCents - a.prizeCents)
    .map((p, i) => ({ ...p, rank: i + 1 }))
  pool.prizePoolCents = result.prizePoolCents
  pool.rakeCents = result.rakeCents
  pool.payouts = payouts
  pool.settledAt = now
  setLifecycle(pool, 'settled')
  for (const e of entries) live.delete(e.id)
  state = { ...state }
  notify()
  return pool
}

/** Void a pool: refund every held entry through core ('void'), no prizes. For under-fill/cancel. */
export function voidPool(id: string, reason: string, now: number): Pool {
  const pool = getPool(id)
  if (!pool) throw new Error('no such pool')
  if (pool.demo) throw new Error('demo pools are display-only')
  if (pool.lifecycle === 'settled' || pool.lifecycle === 'void')
    throw new Error('pool is already finalized')
  voidPoolMoney(holdsFor(id))
  for (const e of entriesForPool(id)) live.delete(e.id)
  pool.voidedAt = now
  pool.voidReason = reason
  setLifecycle(pool, 'void')
  state = { ...state }
  notify()
  return pool
}

/* -------------------------------- invites -------------------------------- */

export function invitePlayer(poolId: string, playerId: string, now: number): PoolInvite {
  const pool = getPool(poolId)
  if (!pool) throw new Error('no such pool')
  // Only the pool's creator (or a manager) may invite — enforce the privacy boundary at the store.
  const viewer = getViewer()
  if (viewer.memberId !== pool.creatorId && viewer.role !== 'manager') {
    throw new Error('only the pool creator or a manager can invite players')
  }
  const invite: PoolInvite = {
    id: nextId('invite'),
    poolId,
    playerId,
    code: `inv-${state.seq}`,
    createdAt: now,
  }
  state = { ...state, invites: [...state.invites, invite] }
  notify()
  return invite
}

/* -------------------------------- leagues -------------------------------- */

export interface CreateLeagueInput extends Omit<CreatePoolInput, 'scope'> {
  weeks: number
  weekWeights?: number[]
}

/** Create a season-long league: a season-scoped pool + its LeagueSeason record. */
export function createLeague(input: CreateLeagueInput): { pool: Pool; league: LeagueSeason } {
  if (!isInt(input.weeks) || input.weeks < 1) throw new Error('a league needs at least one week')
  const pool = createPool({ ...input, scope: 'season' })
  const league: LeagueSeason = {
    id: nextId('league'),
    poolId: pool.id,
    weeks: input.weeks,
    scoringConfig: { weekWeights: input.weekWeights },
    weekResults: {},
  }
  state = { ...state, leagues: [...state.leagues, league] }
  notify()
  return { pool, league }
}

/** Post one week's results into a league (accumulates into the pool's results + the week log). */
export function postWeekResults(
  leagueId: string,
  week: number,
  results: PoolResults,
  now: number,
): Pool {
  const league = getLeague(leagueId)
  if (!league) throw new Error('no such league')
  if (!isInt(week) || week < 0 || week >= league.weeks) throw new Error('week out of range')
  // Run the lifecycle-guarded (and money-bearing) postResults FIRST so a rejected post leaves the
  // week-log untouched — no phantom result lingers on the league.
  const pool = postResults(league.poolId, results, now)
  league.weekResults[week] = results
  state = { ...state }
  notify()
  return pool
}

/* ------------------------------- seed / test ----------------------------- */

const SEED_NOW = 1_720_000_000_000
const DAY = 24 * 60 * 60 * 1000

function seedIfEmpty(now: number = SEED_NOW): void {
  if (state.pools.length > 0) return
  // A single display-only sample pool so the browser isn't empty. demo:true → never joinable,
  // never settles real money. No core money moves on load.
  const pool: Pool = {
    id: nextId('pool'),
    tenantId: getActiveTenant(),
    creatorId: 'mgr',
    creatorName: 'House',
    name: 'Sunday NFL Pick’em',
    kind: 'pickem',
    scope: 'event',
    privacy: 'public',
    entryCents: 1_000,
    maxEntries: null,
    minEntries: 2,
    guaranteedCents: 0,
    prizeStructure: [0.6, 0.3, 0.1],
    rakeBps: 0,
    config: formatFor('pickem').defaultConfig(),
    lifecycle: 'scoring',
    lockAt: now + DAY,
    createdAt: now,
    demo: true,
    results: { kind: 'pickem', winners: { g1: 'Home', g2: 'Away', g3: 'Home' } },
  }
  const demoEntries: PoolEntry[] = [
    {
      id: nextId('entry'),
      poolId: pool.id,
      accountId: 'p-lena',
      playerName: 'Lena',
      joinedAt: now,
      stakeCents: 1_000,
      picks: { kind: 'pickem', selections: { g1: 'Home', g2: 'Away', g3: 'Home' } },
    },
    {
      id: nextId('entry'),
      poolId: pool.id,
      accountId: 'p-priya',
      playerName: 'Priya',
      joinedAt: now,
      stakeCents: 1_000,
      picks: { kind: 'pickem', selections: { g1: 'Home', g2: 'Home', g3: 'Home' } },
    },
  ]
  state = { ...state, pools: [pool], entries: demoEntries }
  notify()
}

export function __resetPools(): void {
  state = { seq: 0, pools: [], entries: [], invites: [], leagues: [] }
  live.clear()
  notify()
}
export function __seedPools(now: number = SEED_NOW): void {
  seedIfEmpty(now)
}

seedIfEmpty()
