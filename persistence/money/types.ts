/**
 * The server-authoritative money seam (CLAUDE.md §3).
 *
 * Today every game and the sportsbook call `core.placeWager / resolveWager / …`
 * directly on an in-browser `Account` — the browser is the authority, which is fine
 * for the points-only MVP but means a tampered client could fabricate a balance.
 * This seam is the path to fixing that WITHOUT reshaping core: one async interface
 * whose money math runs *somewhere trusted*.
 *
 *   - `createLocalMoneyService` runs the math in-process via `core` — byte-for-byte
 *     the current behaviour, the fallback when there are no Supabase keys.
 *   - `createSupabaseMoneyService` runs it server-side via SECURITY DEFINER RPCs, so
 *     the browser only ever *requests* a mutation and receives back the authoritative
 *     result; it can never write `balance` itself (RLS forbids it — see
 *     `supabase/migrations/`).
 *
 * Both return the SAME shapes, so a caller swaps implementations by env alone. The
 * provably-fair RNG stays in core/games untouched — this validates the *ledger
 * writes*, not the dice.
 */

import type { Account, Outcome, Wager } from '../../core/index.js'

/** Result of a money mutation: the authoritative account state after it applied. */
export interface MoneyServiceResult {
  account: Account
}

/** Result of a wager mutation: the account plus the affected wager. */
export interface PlacedResult extends MoneyServiceResult {
  wager: Wager
}

/**
 * The money operations, mirroring `core`'s contract but async and trust-agnostic.
 * Every method returns the AUTHORITATIVE post-mutation state (a snapshot the caller
 * owns), or rejects with the same validation errors `core` throws.
 */
export interface MoneyService {
  /** The current authoritative account, or null if unknown. */
  getAccount(id: string): Promise<Account | null>
  /** Hold a stake (place → pending). `core.placeWager` rules apply. */
  place(accountId: string, stake: number, opts?: { wagerId?: string }): Promise<PlacedResult>
  /** Grade an open wager win/loss/push/void. `core.resolveWager` rules apply. */
  resolve(
    accountId: string,
    wagerId: string,
    outcome: Outcome,
    payoutMultiplier?: number,
  ): Promise<PlacedResult>
  /** Settle an open wager at an arbitrary return multiple. `core.resolveAtMultiplier` rules apply. */
  resolveAt(accountId: string, wagerId: string, multiplier: number): Promise<PlacedResult>
  /** Credit a bonus (free play / points). `core.grant` rules apply. */
  grant(accountId: string, cents: number, meta?: Record<string, unknown>): Promise<MoneyServiceResult>
  /** Operator correction outside the wager flow. `core.adjustBalance` rules apply. */
  adjust(accountId: string, delta: number, meta?: Record<string, unknown>): Promise<MoneyServiceResult>
  /** Weekly square-up (requires no pending). `core.settleWeek` rules apply. */
  settle(accountId: string): Promise<MoneyServiceResult>
}

/**
 * Where the LOCAL money service reads/writes accounts. The shell wires this over its
 * live org (`book-store`) when it adopts the service; tests use a Map-backed source.
 * Keeps the local service decoupled from any one store.
 */
export interface AccountSource {
  get(id: string): Account | null
  set(account: Account): void
}
