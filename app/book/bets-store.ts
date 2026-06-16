/**
 * The book's live-activity store — every placed sportsbook bet, as it sits in the
 * book (open → settled). This is the MANAGER SURFACE for the lane: a manager sees
 * all action, an agent sees only their downline's, a player only their own. It's an
 * in-memory external store (subscribe / version), like app/exposure.ts — the money
 * itself still lives in `core` (placing a bet holds `pending`; settling moves the
 * figure), this just carries the sportsbook-shaped detail (legs, markets, price)
 * the generic ledger can't.
 *
 * Credit/balance only — `stakeCents` / `returnCents` are integer cents.
 */

import { downline, type Role } from '../../org/index.js'
import { getBook } from '../book-store.js'
import type { SlipLeg, SlipMode } from './slip.js'

export type BookBetStatus = 'open' | 'won' | 'lost' | 'push' | 'void' | 'cashed'

export interface BookBet {
  /** The core wager id this bet placed (the parlay wager, or the single leg's wager). */
  id: string
  /** Whose figure it moves — the player account. */
  accountId: string
  playerName: string
  /** Who placed it (the acting viewer; in demo, the player themselves). */
  placedBy: string
  mode: SlipMode
  legs: SlipLeg[]
  stakeCents: number
  /** Combined price (parlay) or the single leg's decimal. */
  decimal: number
  status: BookBetStatus
  placedAt: number
  settledAt?: number
  /** Total returned on settle (stake + profit; 0 on a loss). */
  returnCents?: number
}

let bets: BookBet[] = []
let version = 0
const listeners = new Set<() => void>()

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeBets(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getBetsVersion(): number {
  return version
}

/** Newest first. */
export function getBets(): BookBet[] {
  return bets
}

/** Record a freshly-placed bet at the head of the activity list. */
export function recordBet(bet: BookBet): void {
  bets = [bet, ...bets]
  notify()
}

/** Mark a recorded bet settled. */
export function settleBetRecord(
  id: string,
  status: BookBetStatus,
  returnCents: number,
  at: number,
): void {
  bets = bets.map((b) => (b.id === id ? { ...b, status, returnCents, settledAt: at } : b))
  notify()
}

/** Clear all activity (tests + a fresh demo). */
export function __resetBets(): void {
  bets = []
  notify()
}

/** Open (still-pending) bets only. */
export function openBets(list: BookBet[] = bets): BookBet[] {
  return list.filter((b) => b.status === 'open')
}

/** Total still at risk across a set of bets, in cents. */
export function atRiskCents(list: BookBet[]): number {
  return openBets(list).reduce((sum, b) => sum + b.stakeCents, 0)
}

/**
 * The bets a viewer may see, by role:
 *  - manager: the whole book
 *  - agent / subagent: only accounts in their downline
 *  - player: only their own
 * Mirrors the org scoping the rest of the management surface uses.
 */
export function betsForViewer(viewerId: string, role: Role): BookBet[] {
  if (role === 'manager') return bets
  if (role === 'player') return bets.filter((b) => b.accountId === viewerId)
  // agent / subagent — their downline players
  const org = getBook()
  if (!org.members[viewerId]) return []
  const scope = new Set(downline(org, viewerId).map((m) => m.id))
  return bets.filter((b) => scope.has(b.accountId))
}
