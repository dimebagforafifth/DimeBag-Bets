/**
 * Eligibility — read-only scoping of who may enter a competition, over the org tree + VIP
 * ladder. No money, no mutation: `downline` reads the org roster, `vip_min` reads lifetime
 * wagered off the ledger and compares VIP rank. Used by the store at join and by the creator
 * panel to preview the eligible field.
 */

import { getBook } from '../app/book-store.js'
import { rosterOf, membersByRole } from '../org/index.js'
import { rankFor, defaultVipConfig, type RankId } from '../vip/index.js'
import { totalWagered, scorableBetRows } from './metrics.js'
import type { Eligibility } from './types.js'

/** VIP ladder order, lowest → highest (for `vip_min` comparisons). */
export const RANK_ORDER: RankId[] = ['none', 'bronze', 'silver', 'gold', 'platinum', 'diamond']

/** A player's lifetime credits wagered (cents) — real bets only, entry-fee holds excluded. */
export function lifetimeWagered(accountId: string): number {
  return totalWagered(scorableBetRows(accountId))
}

/** Whether an account satisfies an eligibility rule (read-only over org / VIP / ledger). */
export function isEligible(elig: Eligibility, accountId: string): boolean {
  switch (elig.kind) {
    case 'all':
      return true
    case 'downline':
      return rosterOf(getBook(), elig.agentId).some((p) => p.id === accountId)
    case 'vip_min': {
      const rank = rankFor(lifetimeWagered(accountId), defaultVipConfig())
      return RANK_ORDER.indexOf(rank.id) >= RANK_ORDER.indexOf(elig.minRank)
    }
  }
}

/** Every player eligible for a rule — the creator's preview of the field. Read-only. */
export function eligiblePlayers(elig: Eligibility): { id: string; name: string }[] {
  return membersByRole(getBook(), 'player')
    .filter((p) => isEligible(elig, p.id))
    .map((p) => ({ id: p.id, name: p.name }))
}
