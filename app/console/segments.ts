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
