/**
 * The LOCAL money service — runs the money math in-process through `core`, exactly
 * as the games and sportsbook do today. This is the fallback when there are no
 * Supabase keys: same authority model the app already ships, behind the async
 * `MoneyService` seam so swapping to the server-authoritative path is env-only.
 *
 * It owns nothing it shouldn't: accounts come from an injected `AccountSource` (the
 * shell wires this over its org), and open wagers are tracked here so a later
 * `resolve(wagerId)` can find them. Every returned value is a snapshot — callers
 * can't reach in and mutate service state.
 */

import {
  grant as coreGrant,
  placeWager,
  resolveAtMultiplier,
  resolveWager,
  settleWeek,
  adjustBalance,
  type Account,
  type Outcome,
  type Wager,
} from '../../core/index.js'
import type { AccountSource, MoneyService, MoneyServiceResult, PlacedResult } from './types.js'

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export interface LocalMoneyServiceOpts {
  /** Rehydrate open wagers (e.g. from a persisted snapshot) so resolves survive a reload. */
  initialWagers?: Wager[]
}

/** Build a money service backed by `core` and the given account source. */
export function createLocalMoneyService(
  source: AccountSource,
  opts: LocalMoneyServiceOpts = {},
): MoneyService {
  const wagers = new Map<string, Wager>()
  for (const w of opts.initialWagers ?? []) wagers.set(w.id, w)

  function load(accountId: string): Account {
    const a = source.get(accountId)
    if (!a) throw new Error(`unknown account ${accountId}`)
    return clone(a) // the service mutates its own copy, then writes it back
  }

  function openWager(wagerId: string, accountId: string): Wager {
    const w = wagers.get(wagerId)
    if (!w) throw new Error(`unknown wager ${wagerId}`)
    if (w.accountId !== accountId) {
      throw new Error(`wager ${wagerId} does not belong to account ${accountId}`)
    }
    return w
  }

  return {
    async getAccount(id: string): Promise<Account | null> {
      const a = source.get(id)
      return a ? clone(a) : null
    },

    async place(accountId, stake, placeOpts): Promise<PlacedResult> {
      const account = load(accountId)
      const wager = placeWager(account, stake, placeOpts?.wagerId)
      source.set(account)
      wagers.set(wager.id, wager)
      return { account: clone(account), wager: clone(wager) }
    },

    async resolve(accountId, wagerId, outcome: Outcome, payoutMultiplier): Promise<PlacedResult> {
      const account = load(accountId)
      const wager = openWager(wagerId, accountId)
      resolveWager(account, wager, outcome, payoutMultiplier)
      source.set(account)
      wagers.delete(wagerId) // resolved: no longer open
      return { account: clone(account), wager: clone(wager) }
    },

    async resolveAt(accountId, wagerId, multiplier): Promise<PlacedResult> {
      const account = load(accountId)
      const wager = openWager(wagerId, accountId)
      resolveAtMultiplier(account, wager, multiplier)
      source.set(account)
      wagers.delete(wagerId)
      return { account: clone(account), wager: clone(wager) }
    },

    async grant(accountId, cents, meta): Promise<MoneyServiceResult> {
      const account = load(accountId)
      coreGrant(account, cents, meta)
      source.set(account)
      return { account: clone(account) }
    },

    async adjust(accountId, delta): Promise<MoneyServiceResult> {
      const account = load(accountId)
      adjustBalance(account, delta)
      source.set(account)
      return { account: clone(account) }
    },

    async settle(accountId): Promise<MoneyServiceResult> {
      const account = load(accountId)
      settleWeek(account)
      source.set(account)
      return { account: clone(account) }
    },
  }
}
