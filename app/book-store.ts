/**
 * The book store — the one shared `Org` the whole app runs on (CLAUDE.md §3, §5).
 *
 * This is the keystone that connects PLAY to the MANAGEMENT book. Before this,
 * the casino/sportsbook mutated a throwaway `demo-player` account while the
 * Management console seeded its own separate org — two disconnected worlds. Now:
 *
 *  - There is ONE org (the operator's book). It is loaded from persistence (so
 *    the book + every figure survives a reload) or seeded on first run.
 *  - One member — a PLAYER — is the "current player": who you're playing as. The
 *    casino games and the sportsbook wager against THAT member's `core` Account,
 *    so their figure moves and rolls up Agent → Sub-Agent → Manager (bookFigure).
 *  - The Management console reads this same org, so what you win/lose at the table
 *    shows up live in the book.
 *
 * It's a framework-agnostic external store (subscribe/getSnapshot), mirrored into
 * React with `useSyncExternalStore` — same pattern as the ledger store. Money
 * still flows only through `core`; this module just owns the tree + who's playing
 * and keeps it persisted.
 */

import {
  addAgent,
  addPlayer,
  addSubAgent,
  createOrg,
  getMember,
  membersByRole,
  setCommissionModel,
  settleOrgWeek,
  type Member,
  type Org,
  type Settlement,
} from '../org/index.js'
import { onWagerResolved } from '../core/index.js'
import { createStore, persistedDoc, type Doc } from '../persistence/index.js'

/* ------------------------------- the seed ------------------------------- */

/** A demo book on first run — a real four-tier tree with players to play as. */
function seedDemoOrg(): Org {
  const org = createOrg({ name: 'Your Book', creditLimit: 100_000_000, id: 'mgr' })
  addSubAgent(org, { name: 'North Region', creditLimit: 20_000_000, id: 'sa-n' })
  addSubAgent(org, { name: 'South Region', creditLimit: 20_000_000, id: 'sa-s' })
  addAgent(org, 'sa-n', { name: 'East Desk', creditLimit: 5_000_000, id: 'a-e' })
  addAgent(org, 'sa-s', { name: 'West Desk', creditLimit: 5_000_000, id: 'a-w' })
  // Each tier on a different commission model so the per-member editor + settlement read as
  // real: a split master, a profit-share agent, and two redline desks (one carrying a red
  // figure still to be made up). All credits/cents; settlement honours the model.
  setCommissionModel(org, 'sa-n', { model: 'split', pct: 15 })
  setCommissionModel(org, 'sa-s', { model: 'redline', pct: 25, carryoverCents: -180_000 })
  setCommissionModel(org, 'a-e', { model: 'profit_share', pct: 20 })
  setCommissionModel(org, 'a-w', { model: 'redline', pct: 30, carryoverCents: -50_000 })
  const mk = (parent: string, name: string, credit: number, bal: number, id: string) => {
    const p = addPlayer(org, parent, { name, creditLimit: credit, id })
    p.account.balance = bal // a seeded figure so the roll-up reads as real
  }
  mk('a-e', 'Marco', 200_000, -45_000, 'p-marco')
  mk('a-e', 'Lena', 200_000, 32_000, 'p-lena')
  mk('a-w', 'Tariq', 200_000, -120_000, 'p-tariq')
  mk('sa-n', 'Priya', 300_000, 8_000, 'p-priya') // player straight under a sub-agent
  mk('mgr', 'Dana (VIP)', 1_000_000, 210_000, 'p-dana') // player straight under the manager
  return org
}

/* ----------------------------- persistence ------------------------------ */

const store = createStore({ namespace: 'dimebag' })

/**
 * A structural sanity check on a stored/migrated book: a managerId that resolves to
 * a member, a members map, and every member carrying a core account. Anything else
 * is treated as corrupt and replaced with a fresh seed rather than crashing the app
 * on load — a financial book must never brick on a tampered/partial localStorage doc.
 */
export function isValidOrg(data: unknown): data is Org {
  if (!data || typeof data !== 'object') return false
  const org = data as Org
  if (typeof org.managerId !== 'string') return false
  if (!org.members || typeof org.members !== 'object') return false
  if (!org.members[org.managerId]) return false
  return Object.values(org.members).every(
    (m) => !!m && typeof m === 'object' && !!m.account && typeof m.account === 'object',
  )
}

/**
 * Upgrade an older stored book to the current shape. The first migration (v1→v2)
 * backfills `Member.profile`, which earlier books didn't have, so every member is
 * guaranteed a profile object. A structurally-corrupt payload — or one from a NEWER
 * version after a rollback — is replaced with a fresh seed instead of being mangled
 * (so a bad doc can never throw on load). Money/figures in a valid doc are untouched.
 */
export function migrateOrg(data: unknown, fromVersion: number): Org {
  if (fromVersion > 2 || !isValidOrg(data)) return seedDemoOrg()
  for (const m of Object.values(data.members)) {
    if (!m.profile) m.profile = {}
  }
  return data
}

const ORG_DOC: Doc<Org> = persistedDoc<Org>(store, 'book.org', {
  version: 2,
  initial: seedDemoOrg(),
  migrate: migrateOrg,
})
const PLAYER_DOC: Doc<string | null> = persistedDoc<string | null>(store, 'book.currentPlayer', {
  version: 1,
  initial: null,
})

/**
 * A reload means no bet is actually in flight, so any `pending` hold persisted
 * mid-game is stale — clear it so the figure/availableToWager start clean.
 */
function sanitize(org: Org): Org {
  for (const m of Object.values(org.members ?? {})) {
    if (m?.account) m.account.pending = 0
  }
  return org
}

/* ------------------------------ live state ------------------------------ */

// ORG_DOC.load() migrates stale-version docs, but a tampered CURRENT-version doc is
// returned as-is (bypassing migrate), so validate the result here too: any corrupt
// book falls back to a fresh seed rather than throwing at import and bricking the app.
const loaded = ORG_DOC.load()
const org: Org = sanitize(isValidOrg(loaded) ? loaded : seedDemoOrg())
const listeners = new Set<() => void>()
// The org is mutated IN PLACE (stable reference), so React can't diff it. A
// version counter gives useSyncExternalStore a changing snapshot to re-render on.
let version = 0

/** The first ACTIVE player — who play falls back to. A suspended player can't be
 *  played as (Suspend means "no new action"), so they're skipped. */
function firstPlayerId(): string | null {
  return membersByRole(org, 'player').find((p) => p.active)?.id ?? null
}

/** Whether a member id is a player who can currently take action. */
function isPlayable(id: string | null): boolean {
  if (!id) return false
  const m = org.members[id]
  return m?.role === 'player' && m.active
}

/** The player we're currently playing as. Validated against the live tree so a
 *  stale persisted id (a removed/suspended player) falls back to an active one. */
let currentPlayerId: string | null = (() => {
  const saved = PLAYER_DOC.load()
  if (saved && isPlayable(saved)) return saved
  return firstPlayerId()
})()

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

function persist(): void {
  ORG_DOC.save(org)
  PLAYER_DOC.save(currentPlayerId)
}

/* -------------------------------- the API ------------------------------- */

/** Subscribe to any change to the book (for useSyncExternalStore). */
export function subscribeBook(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A monotonically increasing snapshot for useSyncExternalStore — changes on
 *  every book/play/player change so React re-renders despite the stable org ref. */
export function getBookVersion(): number {
  return version
}

/** The single live org. Stable reference — mutated in place, like a core Account. */
export function getBook(): Org {
  return org
}

/** Every player in the book (who you can play as). */
export function listPlayers(): Member[] {
  return membersByRole(org, 'player')
}

export function getCurrentPlayerId(): string | null {
  return currentPlayerId
}

/** The current player member, or null if there's no active player to play as.
 *  A suspended player is NOT playable — Suspend has to actually stop play. */
export function getCurrentPlayer(): Member | null {
  return isPlayable(currentPlayerId) ? getMember(org, currentPlayerId as string) : null
}

/**
 * Ensure the signed-in auth user has a PLAYER account in the book, creating one under the
 * manager when they don't — a fresh self-signup has no book node yet (auth/demoAdapter
 * leaves them unlinked until an operator recruits them), which is what left onboarding's
 * limits + welcome grant with no figure to apply to. Idempotent: if a member already
 * resolves for this id it's returned untouched. The new player is created with id ≡ userId
 * so accountLink resolves them automatically (demo: user id ≡ member id), seeded active with
 * a standard player credit line, and made the current player so the lobby renders against
 * their figure straight away. Returns the resolved player id.
 *
 * // TODO(api): real mode links via the accounts.user_id column, not by matching member id —
 * this same seam then inserts the accounts row instead of an org member.
 */
export function ensurePlayerAccount(userId: string, displayName: string): string {
  if (org.members[userId]) return userId
  mutateBook((o) => {
    addPlayer(o, o.managerId, {
      id: userId,
      name: displayName?.trim() || userId,
      creditLimit: 200_000,
    })
  })
  setCurrentPlayer(userId)
  return userId
}

/** Switch who you're playing as. Must be an active player. Persists + notifies. */
export function setCurrentPlayer(id: string): void {
  const m = org.members[id]
  if (m?.role !== 'player') throw new Error(`${id} is not a player`)
  if (!m.active) throw new Error(`${m.name} is suspended`)
  currentPlayerId = id
  persist()
  notify()
}

/**
 * Run a mutation against the book (recruit, re-credit, move, settle, …), then
 * persist and notify. Errors propagate to the caller (the Management console
 * surfaces them); the tree is only saved on success.
 */
export function mutateBook(fn: (org: Org) => void): void {
  fn(org)
  // A mutation can remove or SUSPEND the player we're playing as (or change who's
  // a player); fall back to an active player so "playing as" never points at a
  // suspended/missing member.
  if (!isPlayable(currentPlayerId)) {
    currentPlayerId = firstPlayerId()
  }
  persist()
  notify()
}

/** Persist the current book + player. Called after play moves a figure. */
export function saveBook(): void {
  persist()
}

/**
 * Settle the whole book for the period and RETURN the frozen per-member sheet — a
 * mutateBook that surfaces `settleOrgWeek`'s statement (which the void-returning
 * `mutateBook` would otherwise drop). The app's settlement store wraps this to
 * persist the record; the money reset itself runs through core via settleOrgWeek.
 * Throws (mutating nothing) if any wager is still pending.
 */
export function settleBook(carryover = false): Settlement[] {
  let statement: Settlement[] = []
  mutateBook((o) => {
    statement = settleOrgWeek(o, { carryover })
  })
  return statement
}

/* --------------------------- play → persist ----------------------------- */

// Every resolved wager (any game, the sportsbook) moves a member's figure in
// place; persist the book so play survives a reload, and notify so the
// Management console / header reflect it. Registered once on import.
onWagerResolved(() => {
  saveBook()
  notify()
})
