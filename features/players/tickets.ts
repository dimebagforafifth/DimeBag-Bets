/**
 * Players-lane open-ticket queue (NEW). Holds OPEN manual tickets as REAL `core` wagers,
 * so each one already sits in its player's `pending` (availableToWager reflects it) and
 * grading routes through `core.resolveWager` (Win/Loss/Push/Void) — moving the figure
 * exactly like a settled bet and posting to the durable ledger. No money is tracked here.
 *
 * Demo tickets are seeded LAZILY on first read (never at import, so this can't perturb
 * other modules' tests) by PLACING them through `core.placeWager` on live player accounts.
 *
 * // SEAM: open tickets written by the catalog Ticketwriter (another lane) should land
 * // here via `addTicket(...)` so they surface in this Pending queue. Until that wiring
 * // lands the queue is seeded locally. // TODO(api): a shared open-bets store at integration.
 */

import { placeWager, resolveWager, type Wager } from '../../core/index.js'
import { getBook, saveBook } from '../../app/book-store.js'
import { setActiveGame } from '../../app/ledger-store.js'
import { membersByRole } from '../../org/index.js'
import { rngFor, pick } from './rng.js'

export type Grade = 'win' | 'loss' | 'push' | 'void'

export interface OpenTicket {
  id: string
  playerId: string
  playerName: string
  sport: string
  type: string
  selection: string
  /** Decimal odds — the win payout multiplier. */
  price: number
  placedAt: number
  /** The live core wager holding this ticket's stake in `pending`. */
  wager: Wager
}

const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'Soccer'] as const
const TYPES = ['Spread', 'Moneyline', 'Total', 'Player Prop'] as const
const PICKS: Record<string, string[]> = {
  Spread: ['−3.5', '+6.5', '−1.5', '+2.5'],
  Moneyline: ['Home ML', 'Away ML'],
  Total: ['Over 47.5', 'Under 210.5', 'Over 5.5'],
  'Player Prop': ['A. Judge 1+ HR', 'L. Doncic 30+ Pts', 'QB 250+ Yds'],
}

let tickets: OpenTicket[] = []
let seeded = false
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeTickets(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getTicketsVersion(): number {
  return version
}

/** Stake at risk on a ticket (cents). */
export function riskOf(t: OpenTicket): number {
  return t.wager.stake
}
/** Profit a ticket pays if it wins (cents). */
export function toWinOf(t: OpenTicket): number {
  return Math.round(t.wager.stake * (t.price - 1))
}

/**
 * Register a real open ticket: places the stake through core (the hold goes on) and
 * adds it to the queue. This is the entry point the Ticketwriter SEAM will call.
 * Throws (placing nothing) if the stake doesn't fit / betting is locked — core's rules.
 */
function place(
  playerId: string,
  stakeCents: number,
  price: number,
  meta: { sport: string; type: string; selection: string },
): OpenTicket {
  const member = getBook().members[playerId]
  if (!member || member.role !== 'player') throw new Error(`${playerId} is not a player`)
  const wager = placeWager(member.account, stakeCents)
  const ticket: OpenTicket = {
    id: wager.id,
    playerId,
    playerName: member.name,
    price,
    placedAt: Date.now(),
    wager,
    ...meta,
  }
  tickets = [ticket, ...tickets]
  return ticket
}

export function addTicket(
  playerId: string,
  stakeCents: number,
  price: number,
  meta: { sport: string; type: string; selection: string },
): OpenTicket {
  const ticket = place(playerId, stakeCents, price, meta)
  saveBook()
  notify()
  return ticket
}

/**
 * Seed a few deterministic demo tickets (idempotent, lazy). Designed to be called during
 * the Pending panel's FIRST render: it only places holds + fills the in-memory queue (no
 * store notify), so the same render reads the seeded list and there's no post-mount state
 * update. The guard makes it a no-op on every later render (incl. StrictMode's double call).
 */
export function ensureSeeded(): void {
  if (seeded) return
  seeded = true
  const now = Date.now()
  for (const p of membersByRole(getBook(), 'player')) {
    if (!p.active || p.account.bettingLocked) continue
    const rnd = rngFor(`tix:${p.id}`)
    const count = 1 + Math.floor(rnd() * 2) // 1..2 open tickets
    for (let i = 0; i < count; i++) {
      const type = pick(TYPES, rnd())
      const stake = (10 + Math.floor(rnd() * 40)) * 100 // 10..49 coins
      const price = Math.round((1.6 + rnd() * 1.2) * 100) / 100 // 1.60..2.80
      try {
        const t = place(p.id, stake, price, {
          sport: pick(SPORTS, rnd()),
          type,
          selection: pick(PICKS[type], rnd()),
        })
        t.placedAt = now - Math.floor(rnd() * 6) * 3_600_000 // within the last few hours
      } catch {
        /* doesn't fit this player's available — skip */
      }
    }
  }
}

/** Open tickets, newest-first. */
export function listOpenTickets(): OpenTicket[] {
  return tickets
}

/**
 * Manually grade a ticket through core. Win pays at the ticket's price; loss takes the
 * stake; push/void return it. The figure moves via `resolveWager`, which also posts the
 * result to the durable ledger (tagged Sportsbook) and persists the book.
 */
export function gradeTicket(id: string, grade: Grade): void {
  const ticket = tickets.find((t) => t.id === id)
  if (!ticket) return // already graded/removed (e.g. a double-click) — nothing to do
  const account = getBook().members[ticket.playerId]?.account
  if (!account) {
    // The player no longer exists, so this hold can't be graded through core — drop the
    // orphaned ticket from the queue (rather than silently leaving an ungradeable row).
    tickets = tickets.filter((t) => t.id !== id)
    notify()
    return
  }
  setActiveGame('sportsbook', 'Sportsbook') // tag the ledger entry as a sportsbook grade
  if (grade === 'win') resolveWager(account, ticket.wager, 'win', ticket.price)
  else resolveWager(account, ticket.wager, grade)
  tickets = tickets.filter((t) => t.id !== id)
  saveBook()
  notify()
}

/** Release every open ticket's hold and clear the queue (tests / re-seed). */
export function __resetTickets(): void {
  for (const t of tickets) {
    const account = getBook().members[t.playerId]?.account
    if (account && t.wager.status === 'open') resolveWager(account, t.wager, 'void')
  }
  tickets = []
  seeded = false
  notify()
}
