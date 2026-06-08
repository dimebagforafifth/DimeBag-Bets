/**
 * Tournament auto-settle (CLAUDE.md §3, §5) — the shell seam that PAYS OUT a tournament
 * when its window closes. The gamification engine ranks entries and exposes an idempotent
 * `settleTournament` plus a `tournamentEnded` time-gate; this connects them to the LIVE
 * book, so in-the-money players are paid (free-play via core.grant) onto their own book
 * account. It reuses the book's id→account — `getBook().members[id].account` — rather than
 * keeping a parallel map; money still moves only through core.
 *
 * The trigger is opportunistic: settle any already-closed window on start, then re-check
 * after each wager resolves (a window may have just closed). The check is a cheap no-op
 * when nothing has ended — which is the demo's case (its tournament runs until 2100), so
 * this is wired-and-ready without changing demo behaviour. A production backend cron would
 * own this server-side.
 */

import { getConfig, settleTournament, tournamentEnded } from '../gamification/index.js'
import { onWagerResolved, type Account } from '../core/index.js'
import { mutateBook } from './book-store.js'

// A closed window is settled at most once per session (settleTournament is idempotent
// anyway); this just avoids re-entering mutateBook on every later check.
const settledWindows = new Set<string>()

/**
 * Settle every tournament whose window has closed, paying in-the-money players from the
 * live book. Goes through `mutateBook` (persist + notify) only when there's a newly-closed
 * window to settle. Returns the tournament ids that paid out.
 */
export function settleEndedTournaments(now: number = Date.now()): string[] {
  const due = getConfig().tournaments.filter(
    (t) => t.enabled && tournamentEnded(t.id, now) && !settledWindows.has(t.id),
  )
  if (due.length === 0) return []
  const paidOut: string[] = []
  mutateBook((org) => {
    // The book's id→Account map — derived from its members (the canonical source), so
    // the prize lands on the same account object play moves; no duplicate ledger.
    const accounts: Record<string, Account> = {}
    for (const m of Object.values(org.members)) accounts[m.id] = m.account
    for (const t of due) {
      settledWindows.add(t.id)
      if (settleTournament(t.id, accounts, now).length > 0) paidOut.push(t.id)
    }
  })
  return paidOut
}

let unsubscribe: (() => void) | null = null

/**
 * Wire the shell's auto-settle: pay out any already-closed window now, then re-check after
 * every wager resolves. Idempotent (one subscription). Returns a stop fn for cleanup.
 */
export function startTournamentAutoSettle(): () => void {
  settleEndedTournaments()
  if (!unsubscribe) {
    unsubscribe = onWagerResolved(() => settleEndedTournaments())
  }
  return () => {
    unsubscribe?.()
    unsubscribe = null
  }
}

/** Test helper: forget settled windows + drop the subscription, so a test can re-run. */
export function __resetTournamentSettle(): void {
  settledWindows.clear()
  unsubscribe?.()
  unsubscribe = null
}
