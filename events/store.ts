/**
 * The competitions store — the one in-memory list of events + entries the app runs on, plus
 * the lifecycle that routes ALL money through `core`:
 *
 *   • JOIN  — an entry fee HOLDS via `core.placeWager` (free events skip the hold).
 *   • CLOSE — each held fee is collected via `core.resolveWager(… 'loss')`; the prize pool
 *             snapshots (operator guarantee + collected fees).
 *   • PAY   — each in-the-money rank is paid via `core.grant`; the event is marked paid.
 *
 * No separate money path: every credit moves through core (integer cents, audited via its
 * place/resolve/grant events). Standings are pure read-only projections (see leaderboard.ts).
 * Framework-agnostic external store (subscribe / getSnapshot), mirrored into React with
 * useSyncExternalStore — the same pattern as the other app stores. In-memory (no Supabase),
 * so the keyless/local default is unchanged.
 */

import { placeWager, resolveWager, grant, type Account } from '../core/index.js'
import { getBook } from '../app/book-store.js'
import { getActiveGame, setActiveGame } from '../app/ledger-store.js'
import { standingsFor, payoutsFor, prizePool } from './leaderboard.js'
import { ENTRY_GAME_KEY } from './metrics.js'
import { isEligible } from './eligibility.js'
import type {
  Competition,
  CompetitionStatus,
  CompetitionTheme,
  Eligibility,
  Entry,
  MetricType,
  Payout,
} from './types.js'

/* ------------------------------ live state ------------------------------ */

const competitions = new Map<string, Competition>()
let entries: Entry[] = []
let seeded = false
let seqComp = 0
let seqEntry = 0
let version = 0
const listeners = new Set<() => void>()

function emit(): void {
  version++
  for (const l of listeners) l()
}

export function subscribeCompetitions(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function getCompetitionsVersion(): number {
  return version
}
export function getCompetitions(): Competition[] {
  return [...competitions.values()]
}
export function getCompetition(id: string): Competition | undefined {
  return competitions.get(id)
}
export function getEntries(): Entry[] {
  return entries
}
export function entriesFor(competitionId: string): Entry[] {
  return entries.filter((e) => e.competitionId === competitionId)
}
export function entriesForAccount(accountId: string): Entry[] {
  return entries.filter((e) => e.accountId === accountId)
}
export function isEntered(competitionId: string, accountId: string): boolean {
  return entries.some((e) => e.competitionId === competitionId && e.accountId === accountId)
}

/** The status surfaced to the UI: the settlement state once closed/paid, else the time phase. */
export function statusOf(comp: Competition, now: number): CompetitionStatus {
  if (comp.settlement === 'paid') return 'paid'
  if (comp.settlement === 'closed') return 'closed'
  if (now < comp.startsAt) return 'upcoming'
  if (now <= comp.endsAt) return 'live'
  return 'ended' // window over, awaiting the operator's close
}

function accountOf(accountId: string): Account | undefined {
  return getBook().members[accountId]?.account
}

/* ------------------------------- authoring ------------------------------ */

export interface CreateCompetitionInput {
  name: string
  theme: CompetitionTheme
  metric: MetricType
  startsAt: number
  endsAt: number
  entryFeeCents: number
  guaranteedCents: number
  /** Prize split by rank (fraction of pool, index 0 = 1st). Sums to ≤ 1. */
  payoutSplit: number[]
  eligibility: Eligibility
  createdBy: string
  blurb?: string
}

const isInt = (n: number) => Number.isInteger(n)

/** Validate + create a competition (settlement opens). Throws on a bad spec; mutates nothing
 *  until it's valid. The creator panel + templates build the input. */
export function createCompetition(input: CreateCompetitionInput): Competition {
  const name = input.name.trim()
  if (!name) throw new Error('a competition needs a name')
  if (!Number.isFinite(input.startsAt) || !Number.isFinite(input.endsAt)) {
    throw new Error('the window must be finite epoch-ms timestamps')
  }
  if (!(input.endsAt > input.startsAt)) throw new Error('the window must end after it starts')
  if (!isInt(input.entryFeeCents) || input.entryFeeCents < 0) {
    throw new Error('entry fee must be a non-negative whole number of cents')
  }
  if (!isInt(input.guaranteedCents) || input.guaranteedCents < 0) {
    throw new Error('guaranteed pool must be a non-negative whole number of cents')
  }
  if (input.payoutSplit.length === 0) throw new Error('a prize split needs at least one rank')
  if (input.payoutSplit.some((f) => !(f >= 0 && f <= 1))) {
    throw new Error('each prize share must be a fraction between 0 and 1')
  }
  const splitSum = input.payoutSplit.reduce((a, b) => a + b, 0)
  if (splitSum > 1 + 1e-9) throw new Error('prize shares cannot sum to more than the whole pool')

  const comp: Competition = {
    id: `comp-${++seqComp}`,
    name,
    theme: input.theme,
    metric: input.metric,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    entryFeeCents: input.entryFeeCents,
    guaranteedCents: input.guaranteedCents,
    payoutSplit: [...input.payoutSplit],
    eligibility: input.eligibility,
    settlement: 'open',
    createdBy: input.createdBy,
    blurb: input.blurb,
  }
  competitions.set(comp.id, comp)
  emit()
  return comp
}

/* ----------------------------- participation ---------------------------- */

export interface JoinInput {
  competitionId: string
  account: Account
  playerName: string
  now: number
}

/**
 * Opt a player in. The entry fee HOLDS through `core.placeWager` (free events skip it).
 * Throws if the event isn't accepting entries, the player is ineligible or already in, or the
 * fee exceeds what they have available (core enforces that). Nothing is recorded unless the
 * hold succeeds, so a rejected fee leaves no orphan entry.
 */
export function joinCompetition(input: JoinInput): Entry {
  const comp = competitions.get(input.competitionId)
  if (!comp) throw new Error('no such competition')
  if (comp.demo) throw new Error('this is a sample competition and is not joinable')
  const status = statusOf(comp, input.now)
  if (status !== 'upcoming' && status !== 'live') {
    throw new Error('entries are closed for this competition')
  }
  if (isEntered(comp.id, input.account.id)) throw new Error('already entered')
  if (!isEligible(comp.eligibility, input.account.id)) {
    throw new Error('not eligible for this competition')
  }

  // Tag the entry-fee placement under a dedicated game key so its ledger 'loss' (collected at
  // close) is recognizable and excluded from competition scoring (see ENTRY_GAME_KEY) — it
  // funds the pool, not a metric. The book-ledger tags a wager with the game active at PLACE
  // time, so set it around placeWager and restore it (try/finally so a rejected fee can't leak
  // the tag). Free events skip the hold entirely.
  const entryId = `entry-${++seqEntry}`
  let wager
  if (comp.entryFeeCents > 0) {
    const prevGame = getActiveGame()
    setActiveGame(ENTRY_GAME_KEY, 'Competition entry')
    try {
      wager = placeWager(input.account, comp.entryFeeCents)
    } finally {
      setActiveGame(prevGame.key, prevGame.name)
    }
  }

  const entry: Entry = {
    id: entryId,
    competitionId: comp.id,
    accountId: input.account.id,
    playerName: input.playerName,
    joinedAt: input.now,
    wager,
    stakeCents: comp.entryFeeCents,
  }
  entries = [...entries, entry]
  emit()
  return entry
}

/* ------------------------------- lifecycle ------------------------------ */

/**
 * Close an ENDED competition: collect every held entry fee through core (a 'loss' on the held
 * wager funds the pool), snapshot the prize pool AND the final winner list, and lock it for
 * payout. A time-boxed contest only closes once its window has ended — closing a still-live or
 * upcoming event is refused, so prizes can't be settled before the contest actually ran. The
 * standings are FROZEN here (off settled activity through `endsAt`) so post-close play can't
 * change who gets paid. Idempotent guard: only an 'open' event can be closed.
 */
export function closeCompetition(id: string, now: number): Competition {
  const comp = competitions.get(id)
  if (!comp) throw new Error('no such competition')
  if (comp.demo) throw new Error('demo competitions are display-only and cannot be settled')
  if (comp.settlement !== 'open') throw new Error('competition is already closed')
  if (now < comp.endsAt)
    throw new Error('competition is still live; it can be closed after it ends')

  let collected = 0
  for (const e of entriesFor(id)) {
    if (e.wager && e.wager.status === 'open') {
      const account = accountOf(e.accountId)
      if (account) {
        resolveWager(account, e.wager, 'loss') // the entry fee is collected into the pool
        collected += e.stakeCents
      }
    }
  }
  // Demo events carry a pre-seeded pool; real events snapshot guarantee + collected fees.
  comp.prizePoolCents = comp.prizePoolCents ?? comp.guaranteedCents + collected
  // Freeze the winner list now (the window is over, so this is the final board) — payout
  // grants from this snapshot, never a re-derivation, so the result can't drift after close.
  comp.payouts = payoutsFor(standingsFor(comp, entries, now))
  comp.settlement = 'closed'
  emit()
  return comp
}

/**
 * Pay out a closed competition: grant each in-the-money rank its FROZEN prize (snapshotted at
 * close) through `core.grant` and mark it paid. Idempotent guard: only a 'closed' event can be
 * paid. Returns the payouts.
 */
export function payCompetition(id: string, now: number): Payout[] {
  const comp = competitions.get(id)
  if (!comp) throw new Error('no such competition')
  if (comp.demo) throw new Error('demo competitions are display-only and cannot be paid out')
  if (comp.settlement !== 'closed') throw new Error('competition must be closed before payout')

  const payouts = comp.payouts ?? [] // the frozen list from close — not re-derived here
  for (const p of payouts) {
    const account = accountOf(p.accountId)
    if (account && p.prizeCents > 0) {
      grant(account, p.prizeCents, {
        kind: 'prize',
        source: 'competition',
        competitionId: id,
        rank: p.rank,
      })
    }
  }
  comp.paidAt = now
  comp.settlement = 'paid'
  emit()
  return payouts
}

/* -------------------------------- standings ----------------------------- */

/** The live (or final) standings for a competition — a pure read-only projection. */
export function leaderboard(comp: Competition, now: number) {
  return standingsFor(comp, entries, now)
}

/** The projected prize pool right now (operator guarantee + entry fees so far). */
export function projectedPool(comp: Competition): number {
  return comp.prizePoolCents ?? prizePool(comp, entriesFor(comp.id).length)
}

/* ------------------------------- seeding -------------------------------- */

/** Register a pre-built (demo) competition directly — used by the seed. */
export function addCompetition(comp: Competition): void {
  competitions.set(comp.id, comp)
  if (seqComp < parseSeq(comp.id)) seqComp = parseSeq(comp.id)
  emit()
}

/** Register a pre-built demo entry directly (display only — no core hold). */
export function addEntry(entry: Entry): void {
  entries = [...entries, entry]
  emit()
}

function parseSeq(id: string): number {
  const n = Number(id.replace(/^comp-/, ''))
  return Number.isFinite(n) ? n : 0
}

export function hasSeeded(): boolean {
  return seeded
}
export function markSeeded(): void {
  seeded = true
}

/** Test hook: wipe the store. */
export function __resetCompetitions(): void {
  competitions.clear()
  entries = []
  seeded = false
  seqComp = 0
  seqEntry = 0
  version = 0
}
