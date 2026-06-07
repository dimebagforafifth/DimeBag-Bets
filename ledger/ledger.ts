/**
 * Ledger — an append-only transaction history layered OVER the money core
 * (CLAUDE.md §3), without changing it. `core` mutates an account in place and
 * forgets; many things (an account page, weekly statements, the org book, audit)
 * want the running story instead. This module gives you core-mirroring wrappers —
 * `place`/`resolve`/`resolveAt`/`settle` — that do exactly what core does AND
 * record an immutable entry with the before/after figures. Existing code is
 * untouched; code that wants history simply routes its core calls through here.
 *
 * It tracks money only — never game specifics — staying as generic as core.
 */

import type { Account, Outcome, Wager } from '../core/index.js'
import { placeWager, resolveAtMultiplier, resolveWager, settleWeek } from '../core/index.js'

export type LedgerKind = 'place' | 'resolve' | 'settle' | 'adjust'

/** One recorded money movement, with the figure before/after captured. */
export interface LedgerEntry {
  seq: number
  at: number
  kind: LedgerKind
  accountId: string
  wagerId?: string
  /** Signed change to the figure (balance) from this event. */
  balanceDelta: number
  /** Signed change to the at-risk hold (pending) from this event. */
  pendingDelta: number
  balanceAfter: number
  pendingAfter: number
  outcome?: Outcome
  multiplier?: number
  /**
   * Who initiated this movement, for the audit trail — a staff/operator id (e.g.
   * 'operator' until real auth lands) on a manual `adjust`/`settle`. Undefined for
   * automatic play (place/resolve), which is attributed to the player's own action.
   */
  actor?: string
  /** Free-text reason for a manual movement (a re-credit, correction, comp). */
  reason?: string
  /** Caller context (e.g. { game: 'mines' } or { ticketId }). */
  meta?: Record<string, unknown>
}

type Meta = Record<string, unknown> | undefined

export interface Ledger {
  /** Every recorded entry, oldest first; optionally filtered to one account. */
  entries(accountId?: string): LedgerEntry[]
  /** Hold a stake through core and record the placement. */
  place(account: Account, stake: number, meta?: Meta): Wager
  /** Grade a wager (win/loss/push/void) through core and record the settlement. */
  resolve(account: Account, wager: Wager, outcome: Outcome, multiplier?: number, meta?: Meta): void
  /** Settle a wager at an arbitrary return multiplier through core and record it. */
  resolveAt(account: Account, wager: Wager, m: number, meta?: Meta): void
  /** Square up the week through core and record the reset. */
  settle(account: Account, meta?: Meta): void
  /** Record an arbitrary movement (for callers wiring in other money flows). */
  record(entry: Omit<LedgerEntry, 'seq' | 'at'> & { at?: number }): LedgerEntry
}

export function createLedger(
  opts: {
    now?: () => number
    /** Rehydrate from a persisted log (seq continues past the highest entry). */
    initial?: LedgerEntry[]
    /** Called with each newly recorded entry — the seam a persisted ledger uses
     *  to save the log without the ledger knowing about storage. */
    onRecord?: (entry: LedgerEntry, log: LedgerEntry[]) => void
  } = {},
): Ledger {
  const now = opts.now ?? (() => Date.now())
  const log: LedgerEntry[] = opts.initial ? [...opts.initial] : []
  let seq = log.reduce((mx, e) => Math.max(mx, e.seq), 0)

  function record(entry: Omit<LedgerEntry, 'seq' | 'at'> & { at?: number }): LedgerEntry {
    const full: LedgerEntry = { ...entry, seq: ++seq, at: entry.at ?? now() }
    log.push(full)
    opts.onRecord?.(full, log)
    return full
  }

  /** Record a settlement of `wager`, capturing the figure delta + outcome AFTER
   *  the core mutation has run (so wager.outcome/payoutMultiplier are populated). */
  function recordResolve(account: Account, wager: Wager, b0: number, p0: number, meta: Meta): void {
    record({
      kind: 'resolve',
      accountId: account.id,
      wagerId: wager.id,
      balanceDelta: account.balance - b0,
      pendingDelta: account.pending - p0,
      balanceAfter: account.balance,
      pendingAfter: account.pending,
      outcome: wager.outcome,
      // core only stamps payoutMultiplier on a win; normalize the others so the
      // ledger reports a consistent return multiple (loss → 0, push/void → 1).
      multiplier: wager.payoutMultiplier ?? (wager.outcome === 'loss' ? 0 : 1),
      meta,
    })
  }

  return {
    entries: (accountId?: string) =>
      accountId ? log.filter((e) => e.accountId === accountId) : [...log],

    record,

    place(account, stake, meta) {
      const wager = placeWager(account, stake)
      record({
        kind: 'place',
        accountId: account.id,
        wagerId: wager.id,
        balanceDelta: 0,
        pendingDelta: stake,
        balanceAfter: account.balance,
        pendingAfter: account.pending,
        meta,
      })
      return wager
    },

    resolve(account, wager, outcome, multiplier, meta) {
      const b0 = account.balance
      const p0 = account.pending
      resolveWager(account, wager, outcome, multiplier)
      recordResolve(account, wager, b0, p0, meta)
    },

    resolveAt(account, wager, m, meta) {
      const b0 = account.balance
      const p0 = account.pending
      resolveAtMultiplier(account, wager, m)
      recordResolve(account, wager, b0, p0, meta)
    },

    settle(account, meta) {
      const b0 = account.balance
      const p0 = account.pending
      settleWeek(account)
      record({
        kind: 'settle',
        accountId: account.id,
        balanceDelta: account.balance - b0,
        pendingDelta: account.pending - p0,
        balanceAfter: account.balance,
        pendingAfter: account.pending,
        meta,
      })
    },
  }
}

export interface LedgerSummary {
  /** Number of wagers placed. */
  placed: number
  /** Number of wagers graded. */
  resolved: number
  /** Total staked (sum of placement holds) — betting turnover. */
  turnover: number
  /** Net figure movement from grading wagers (wins − losses). */
  net: number
}

/** Roll a set of entries into a turnover + net P&L summary. Pure. */
export function summarize(entries: LedgerEntry[]): LedgerSummary {
  let placed = 0
  let resolved = 0
  let turnover = 0
  let net = 0
  for (const e of entries) {
    if (e.kind === 'place') {
      placed += 1
      turnover += e.pendingDelta
    } else if (e.kind === 'resolve') {
      resolved += 1
      net += e.balanceDelta
    }
  }
  return { placed, resolved, turnover, net }
}
