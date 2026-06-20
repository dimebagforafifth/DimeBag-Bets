/**
 * Pool escrow — the ONLY money path, all through core, conserved + auditable.
 *
 *   HOLD   (enter)  — the entry fee HOLDS via core.placeWager into the player's pending. The hold
 *                     IS the escrow; credits sit in pending until the pool settles or voids.
 *   COLLECT (settle)— each held fee is collected via core.resolveWager(…, 'loss') into the pool.
 *   PAY    (settle) — the pool is split by the EXISTING pool-conserving allocator (allocatePrizes,
 *                     largest-remainder, Σ ≤ pool) and granted to winners; the leftover (operator
 *                     rake + any undistributed weight) is granted to the operator — so every credit
 *                     collected is accounted for: Σ prize grants + rake grant == pool.
 *   REFUND (void)   — each held fee is released via core.resolveWager(…, 'void'): pending freed,
 *                     balance untouched = a full refund. Free pools hold nothing, so void is a no-op.
 *
 * CONSERVATION: for a settled pool, Σ(prize grants) + rakeCents == guaranteedCents + Σ(collected
 * entry fees). For a voided pool, Σ(refunds) == Σ(holds) and no balance moves. Asserted in tests.
 */

import {
  availableToWager,
  grant,
  placeWager,
  resolveWager,
  type Account,
  type Wager,
} from '../core/index.js'
import { getActiveGame, setActiveGame } from '../app/ledger-store.js'
import { allocatePrizes } from '../events/leaderboard.js'
import type { FormatWinner } from './formats/types.js'

/** Tag pool buy-ins under a dedicated game key so their collection 'loss' is excluded from
 *  betting metrics (mirrors events' ENTRY_GAME_KEY). */
export const POOL_ENTRY_KEY = 'pool-entry'

function clampBps(bps: number): number {
  if (!Number.isFinite(bps)) return 0
  return Math.min(10_000, Math.max(0, Math.trunc(bps)))
}

/** Place the entry-fee hold through core (the escrow leg). Returns undefined for a free pool. */
export function holdEntryFee(account: Account, entryCents: number): Wager | undefined {
  if (entryCents <= 0) return undefined
  if (!Number.isInteger(entryCents)) throw new Error('entry fee must be whole cents')
  if (entryCents > availableToWager(account))
    throw new Error('entry fee exceeds your available credit')
  const prev = getActiveGame()
  setActiveGame(POOL_ENTRY_KEY, 'Pool entry')
  try {
    return placeWager(account, entryCents)
  } finally {
    setActiveGame(prev.key, prev.name)
  }
}

export interface EntryHold {
  accountId: string
  account: Account
  wager: Wager
}

export interface SettleMoneyInput {
  poolId: string
  guaranteedCents: number
  rakeBps: number
  /** Every open entry hold to collect into the pool. */
  holds: EntryHold[]
  /** The format's prize-weight winners (weights are fractions of the prize pool, Σ ≤ 1). */
  winners: FormatWinner[]
  accountOf: (accountId: string) => Account | undefined
  /** Where the rake lands (the operator/house account) — required for conservation when rake > 0. */
  operatorAccount: Account | undefined
}

export interface SettleMoneyResult {
  /** guaranteed + collected fees. */
  prizePoolCents: number
  rakeCents: number
  payouts: { accountId: string; prizeCents: number }[]
}

/** Collect held fees, split the pool by the conserving allocator, grant prizes + the rake. */
export function settlePoolMoney(input: SettleMoneyInput): SettleMoneyResult {
  // A funded pool ALWAYS needs an operator account: the rake, plus any weight that finds no
  // winner / any prize that can't be delivered, lands there. Without it those collected credits
  // would vanish. Check up front (before any 'loss' mutates state) so a misconfigured settle
  // throws cleanly rather than half-collecting. (The store always supplies the manager account.)
  const poolFunded = input.guaranteedCents > 0 || input.holds.some((h) => h.wager.status === 'open')
  if (poolFunded && !input.operatorAccount) {
    throw new Error(
      'a funded pool needs an operator account to receive the rake / undistributed pot',
    )
  }

  // 1. collect each held entry fee into the pool (a 'loss' moves the held stake out of the figure).
  let collected = 0
  for (const h of input.holds) {
    if (h.wager.status === 'open') {
      resolveWager(h.account, h.wager, 'loss')
      collected += h.wager.stake
    }
  }
  const pool = input.guaranteedCents + collected

  // 2. take the operator rake off the top, then split the remainder by winner weight. Normalize
  //    weights so Σ ≤ 1 — a format that ever returns weights summing past 1 can NEVER overpay the
  //    pool (allocatePrizes only clamps the rounding remainder, not the floored base).
  const rakeFromBps = Math.round((pool * clampBps(input.rakeBps)) / 10_000)
  const prizePool = Math.max(0, pool - rakeFromBps)
  const raw = input.winners.map((w) => Math.max(0, w.weight))
  const totalW = raw.reduce((a, b) => a + b, 0)
  const weights = totalW > 1 ? raw.map((w) => w / totalW) : raw
  const cents = allocatePrizes(prizePool, weights)
  const payouts = input.winners
    .map((w, i) => ({ accountId: w.accountId, prizeCents: cents[i] ?? 0 }))
    .filter((p) => p.prizeCents > 0)

  // 3. grant prizes through core, tracking what was ACTUALLY delivered.
  let granted = 0
  for (const p of payouts) {
    const a = input.accountOf(p.accountId)
    if (a) {
      grant(a, p.prizeCents, { kind: 'prize', source: 'pool', poolId: input.poolId })
      granted += p.prizeCents
    }
  }

  // 4. rake = pool − Σ ACTUALLY granted (the bps cut + any weight that found no winner + any prize
  //    that couldn't be delivered) — granted to the operator so every collected credit is on the
  //    ledger: Σ(prize grants) + rake == pool. Computing off `granted`, not the planned payouts,
  //    is what keeps an unresolvable winner from destroying credits.
  const rakeCents = pool - granted
  if (rakeCents > 0 && input.operatorAccount) {
    grant(input.operatorAccount, rakeCents, { kind: 'rake', source: 'pool', poolId: input.poolId })
  }

  return {
    prizePoolCents: pool,
    rakeCents,
    payouts: payouts.filter((p) => input.accountOf(p.accountId)),
  }
}

/** Refund every held entry fee through core ('void' releases the hold, balance untouched). */
export function voidPoolMoney(holds: EntryHold[]): void {
  for (const h of holds) {
    if (h.wager.status === 'open') resolveWager(h.account, h.wager, 'void')
  }
}
