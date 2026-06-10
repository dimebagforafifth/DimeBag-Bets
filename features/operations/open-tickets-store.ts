/**
 * Open-tickets store — the shared registry of operator-written OPEN ("grade-later")
 * tickets that closes the Ticketwriter ▸ Pending loop.
 *
 * When an operator writes a ticket and leaves it OPEN (features/catalog/TicketWriterPanel),
 * core has already taken the hold — the stake sits in `account.pending` — but the live
 * `Wager` object (the thing `resolveWager` needs to grade it) lives only in that
 * component's closure and is otherwise lost the moment the panel unmounts. This module
 * is the singleton that REMEMBERS those open wagers (by reference) so the Pending panel
 * can list them and grade them later through `mutateBook(() => resolveWager(...))`.
 *
 * It mirrors the overlay/edge-store singleton shape exactly — module-level state + a
 * version counter + a listener set — so a panel drives it with `useSyncExternalStore`,
 * and it stays pure and trivially testable. It moves NO money itself; it only holds the
 * Wager reference + the display meta. The figure only ever moves through core.
 *
 * // SEAM: persist open tickets across reload. Today this registry is in-memory and
 * // session-scoped: `account.pending` IS persisted (the hold survives a reload via
 * // book-store), but the live `Wager` objects are NOT — they're minted in core's
 * // in-memory sequence and never serialized. So after a reload the held coins are
 * // still pending yet have no grade-able ticket here. The durable fix is to persist
 * // open tickets (id + accountId + stake + meta) alongside the book and rebuild a
 * // gradeable Wager from core on load. // TODO(api)
 */

import type { Wager } from '../../core/index.js'

/** One operator-written open ticket awaiting grade. Carries the live core `Wager`
 *  BY REFERENCE so the Pending panel can pass it straight to `resolveWager`. */
export interface OpenTicket {
  /** The core wager's id — also this ticket's key (one ticket per open wager). */
  id: string
  /** Whose figure the hold is on (the player's account id == member id). */
  playerId: string
  /** The player's display name, captured at write time (for the Pending row). */
  playerName: string
  /** The live, open core wager — graded later via resolveWager(account, wager, …). */
  wager: Wager
  /** Stake at risk, in integer cents (mirrors wager.stake for display without a deref). */
  stake: number
  /** The payout multiplier the operator priced the ticket at — the multiple a WIN
   *  grades to (`resolveWager(account, wager, 'win', multiplier)`). */
  multiplier: number
  /** What the ticket is on (a selection label or a free-text note). */
  description: string
  /** When it was written (ms epoch), for "placed … ago" + newest-first ordering. */
  placedAt: number
}

/* ------------------------------- the state ------------------------------- */

// Insertion-ordered map keyed by wager id (one entry per open wager). A Map keeps
// stable references and lets remove(id) be O(1) when a ticket is graded.
const tickets = new Map<string, OpenTicket>()
let version = 0
const listeners = new Set<() => void>()

function bump(): void {
  version += 1
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* a listener must never break ticket bookkeeping */
    }
  }
}

/* ------------------------------ subscription ----------------------------- */

/** Subscribe to open-ticket changes (for useSyncExternalStore / a panel). */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A version counter that ticks on every change (for useSyncExternalStore). */
export function getVersion(): number {
  return version
}

/* --------------------------------- the API ------------------------------- */

/**
 * Register an operator-written OPEN ticket. The caller has already taken the hold
 * through core (placeWager succeeded) and passes the resulting live `Wager`; we keep
 * it by reference so it can be graded later. Re-registering the same wager id replaces
 * the entry (idempotent). Returns the stored ticket.
 */
export function record(ticket: OpenTicket): OpenTicket {
  tickets.set(ticket.id, ticket)
  bump()
  return ticket
}

/** Every open ticket, NEWEST FIRST (most recently written at the top). */
export function list(): OpenTicket[] {
  return [...tickets.values()].sort((a, b) => b.placedAt - a.placedAt)
}

/** Open tickets for one player, newest first. */
export function getForPlayer(playerId: string): OpenTicket[] {
  return list().filter((t) => t.playerId === playerId)
}

/** Drop a ticket once it's been graded (or otherwise resolved). No-op if absent. */
export function remove(id: string): void {
  if (tickets.delete(id)) bump()
}

/** Clear every open ticket (mainly for tests / a reset). */
export function resetOpenTickets(): void {
  tickets.clear()
  bump()
}
