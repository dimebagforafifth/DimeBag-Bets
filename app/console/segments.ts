/**
 * Player segmentation — bucket players into New / Casual / VIP / Dormant from the
 * existing reporting activity + the VIP program (CLAUDE.md §4). Pure classifier so it's
 * trivially testable; the UI joins it to player names and counts. Reads only — no money.
 */

import type { PlayerActivity } from '../../manager/reporting/index.js'

export type Segment = 'new' | 'casual' | 'vip' | 'dormant'

export const SEGMENT_LABEL: Record<Segment, string> = {
  new: 'New',
  casual: 'Casual',
  vip: 'VIP',
  dormant: 'Dormant',
}

const DAY = 86_400_000
/** First active within this many days ⇒ "new". */
export const NEW_DAYS = 7
/** No activity for longer than this ⇒ "dormant". */
export const DORMANT_DAYS = 14

/** Inactive longer than this ⇒ "churn risk" (a softer flag than full dormancy). */
export const CHURN_RISK_DAYS = 7

/**
 * Classify one player. VIP status (from the loyalty program) wins outright; otherwise
 * recency of first/last activity decides new vs dormant vs casual.
 */
export function classify(activity: PlayerActivity, now: number, isVip: boolean): Segment {
  if (isVip) return 'vip'
  if (now - activity.firstActive <= NEW_DAYS * DAY) return 'new'
  if (now - activity.lastActive > DORMANT_DAYS * DAY) return 'dormant'
  return 'casual'
}

/** Whether a player counts as a churn risk: no activity for `CHURN_RISK_DAYS`+ days. */
export function isChurnRisk(lastActive: number, now: number): boolean {
  return now - lastActive > CHURN_RISK_DAYS * DAY
}

/** A minimal row shape the metric rollup needs (the panel's Row satisfies it). */
export interface SegmentMember {
  turnover: number
  /** Net to the player (signed cents). */
  net: number
  lastActive: number
}

/** Rolled-up health of one cohort, for the segment summary strip. All money in cents. */
export interface SegmentMetrics {
  /** Number of players in the cohort. */
  size: number
  /** Sum of turnover across the cohort (cents). */
  totalTurnover: number
  /** Sum of player net across the cohort (cents, signed). */
  totalNet: number
  /** Average player value to the book = −net/size (cents). Positive ⇒ book is up on
   *  this cohort; 0 when the cohort is empty. */
  avgPlayerValue: number
  /** How many players haven't acted in `CHURN_RISK_DAYS`+ days. */
  churnRisk: number
}

/**
 * Roll a set of cohort members up into the summary metrics shown above a segment.
 * Pure (now injected) so it's testable and order-independent. "Player value" is framed
 * from the BOOK's side — a player who loses (negative net) is worth more — so a positive
 * average means the book profits on this cohort on average.
 */
export function segmentMetrics(members: SegmentMember[], now: number): SegmentMetrics {
  let totalTurnover = 0
  let totalNet = 0
  let churnRisk = 0
  for (const m of members) {
    totalTurnover += m.turnover
    totalNet += m.net
    if (isChurnRisk(m.lastActive, now)) churnRisk += 1
  }
  const size = members.length
  return {
    size,
    totalTurnover,
    totalNet,
    avgPlayerValue: size === 0 ? 0 : Math.round(-totalNet / size),
    churnRisk,
  }
}
