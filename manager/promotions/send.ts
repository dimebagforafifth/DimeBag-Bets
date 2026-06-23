/**
 * Sending a bonus — the impure action that ties promotions to the book.
 *
 * It resolves + validates the plan (promotions.ts), then credits each targeted
 * player through `core.grant` INSIDE `book-store.mutateBook`, so the figure moves
 * through the one sanctioned primitive, the book persists, and the header/console
 * re-render. Each grant emits a core grant event the analytics feed records. The
 * campaign metadata is appended to the promo log. Money never moves outside core.
 */

import { getBook, mutateBook } from '../../app/book-store.js'
import { getMember } from '../../features/org/index.js'
import { grant } from '../../core/index.js'
import { planBonus, type BonusDraft } from './promotions.js'
import { promoStore, type PromoStore } from './promo-store.js'

export interface SendResult {
  players: number
  perPlayer: number
  total: number
}

/** Grant `draft` to its target(s). Throws (before moving any money) on a bad
 *  amount or an empty target. `log` is injectable for tests. */
export function sendBonus(draft: BonusDraft, log: PromoStore = promoStore): SendResult {
  const org = getBook()
  const plan = planBonus(org, draft) // validates + resolves; throws before any credit
  const targetName = getMember(org, draft.targetId).name

  mutateBook(() => {
    for (const p of plan.players) {
      grant(p.account, draft.cents, { promo: draft.note ?? draft.type, type: draft.type })
    }
  })

  log.add({
    targetId: draft.targetId,
    targetName,
    type: draft.type,
    note: draft.note,
    perPlayer: plan.perPlayer,
    players: plan.players.length,
    total: plan.total,
  })

  return { players: plan.players.length, perPlayer: plan.perPlayer, total: plan.total }
}
