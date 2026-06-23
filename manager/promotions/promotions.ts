/**
 * Promotions — free-play / point bonuses (CLAUDE.md §3: money only through core).
 *
 * PURE planning: resolve who a target credits and validate the amount. The actual
 * credit happens in send.ts via `core.grant` inside `book-store.mutateBook`, so the
 * figure moves through the one sanctioned primitive and the book persists. This
 * file moves no money and touches no store.
 */

import type { Member, Org } from '../../features/org/index.js'
import { downline, getMember } from '../../features/org/index.js'

export type BonusType = 'freeplay' | 'bonus'

export interface BonusDraft {
  /** A player id (single grant) OR an agent/sub-agent/manager id (bulk: its
   *  downline players). */
  targetId: string
  /** Points credited to EACH targeted player, in cents. */
  cents: number
  type: BonusType
  /** Optional label, stored on the grant + the campaign log. */
  note?: string
}

/**
 * The player members a target resolves to: a single player, or every player in an
 * agent/sub-agent/manager's downline. Active-only by default — a suspended player
 * takes no new action, so bulk promos skip them; grant to one explicitly to
 * override. Pure.
 */
export function targetPlayers(org: Org, targetId: string, opts: { activeOnly?: boolean } = {}): Member[] {
  const m = getMember(org, targetId) // throws on an unknown id
  if (m.role === 'player') return [m]
  const players = downline(org, targetId).filter((x) => x.role === 'player')
  return opts.activeOnly === false ? players : players.filter((p) => p.active)
}

export interface BonusPlan {
  players: Member[]
  /** Cents each player receives. */
  perPlayer: number
  /** Cents across all targeted players. */
  total: number
}

/**
 * Validate a draft and resolve exactly who would be credited and for how much.
 * Throws on a non-positive/non-integer amount or a target with no eligible
 * players. Pure — no money moves here; send.ts applies the plan.
 */
export function planBonus(org: Org, draft: BonusDraft): BonusPlan {
  if (!Number.isInteger(draft.cents) || draft.cents <= 0) {
    throw new Error('bonus must be a positive whole number of points')
  }
  const players = targetPlayers(org, draft.targetId)
  if (players.length === 0) throw new Error('no eligible players for this target')
  return { players, perPlayer: draft.cents, total: draft.cents * players.length }
}
