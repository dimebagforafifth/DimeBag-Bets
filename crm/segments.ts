/**
 * Dynamic CRM segments + lifecycle — wagering-native player buckets a generic CRM
 * can't model (stake level, game preference, parlay appetite, cadence, churn-risk).
 * Pure over BehaviorFeatures, so a segment re-derives the moment behaviour changes.
 * Complements the legacy New/Casual/VIP/Dormant in app/console/segments.ts with a
 * richer behavioural read. Read-only.
 */

import type { BehaviorFeatures, CrmSegment, LifecycleStage, SegmentResult } from './types.js'

export const SEGMENT_LABEL: Record<CrmSegment, string> = {
  whale: 'Whale',
  grinder: 'Grinder',
  'sports-regular': 'Sports regular',
  'parlay-lotto': 'Parlay lotto',
  'casino-regular': 'Casino regular',
  casual: 'Casual',
  new: 'New',
  dormant: 'Dormant',
}

export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  onboarding: 'Onboarding',
  habit: 'Habit',
  vip: 'VIP',
  'at-risk': 'At-risk',
  dormant: 'Dormant',
  reactivated: 'Reactivated',
}

/** Days since signup at/under which a player is still "new". */
export const NEW_DAYS = 7
/** Days since last bet over which a player is "dormant". */
export const DORMANT_DAYS = 21
/** Churn-risk at/over which a still-active player is "at-risk". */
export const AT_RISK_CHURN = 0.55

/**
 * The behavioural archetype. Precedence: lapsed/brand-new first (they override
 * everything), then stake level (a whale is a whale whatever they play), then the
 * sportsbook long-shot pattern, then cadence (grinder), then product lean.
 */
export function segmentOf(b: BehaviorFeatures): CrmSegment {
  if (b.bets === 0 || b.daysSinceSignup <= NEW_DAYS) return 'new'
  if (b.recencyDays > DORMANT_DAYS) return 'dormant'
  if (b.stakeTier === 'whale' || b.stakeTier === 'high') return 'whale'
  if (b.sportsbookShare >= 0.4 && b.parlayShare >= 0.5) return 'parlay-lotto'
  if (
    b.betsPerActiveDay >= 6 &&
    b.activeDays >= 4 &&
    (b.stakeTier === 'micro' || b.stakeTier === 'low')
  )
    return 'grinder'
  if (b.productLean === 'sportsbook') return 'sports-regular'
  if (b.productLean === 'casino') return 'casino-regular'
  return 'casual'
}

/**
 * Lifecycle stage. `isVip` comes from the loyalty program (wins outright for an
 * active player). Otherwise: brand-new → onboarding; lapsed → dormant; a recently
 * returned long-tenured low-activity account → reactivated; a still-active account
 * with high churn-risk → at-risk; else they've formed a habit.
 */
export function lifecycleOf(b: BehaviorFeatures, isVip: boolean): LifecycleStage {
  if (b.recencyDays > DORMANT_DAYS) return 'dormant'
  if (isVip) return 'vip'
  if (b.daysSinceSignup <= NEW_DAYS) return 'onboarding'
  // back recently (≤7d) after a long-tenured but thin history ⇒ reactivated
  if (b.daysSinceSignup >= 30 && b.activeDays <= 4 && b.recencyDays <= 7) return 'reactivated'
  if (b.churnRisk >= AT_RISK_CHURN) return 'at-risk'
  return 'habit'
}

const fmtCents = (c: number): string => `$${Math.round(c / 100)}`

/** Short descriptive dimension tags surfaced on the profile chip row. */
export function tagsOf(b: BehaviorFeatures): string[] {
  const tags: string[] = []
  tags.push(`${b.stakeTier} stakes`)
  if (b.productLean !== 'mixed') tags.push(b.productLean)
  else tags.push('mixed product')
  if (b.topGameName && b.topGameShare >= 0.4) tags.push(`${b.topGameName} fan`)
  if (b.sgpShare >= 0.3) tags.push('SGP-heavy')
  else if (b.parlayShare >= 0.5) tags.push('parlay-heavy')
  if (b.betsPerActiveDay >= 8) tags.push('high-frequency')
  if (b.topUps >= 3) tags.push('frequent top-ups')
  if (b.churnRisk >= AT_RISK_CHURN && b.recencyDays <= DORMANT_DAYS) tags.push('cooling off')
  if (b.avgSessionMin >= 45) tags.push('long sessions')
  if (b.bets > 0) tags.push(`~${fmtCents(b.medianStakeCents)}/bet`)
  return tags
}

/** The full segment read for one player. */
export function classifySegment(b: BehaviorFeatures, isVip: boolean): SegmentResult {
  return {
    playerId: b.playerId,
    segment: segmentOf(b),
    lifecycle: lifecycleOf(b, isVip),
    tags: tagsOf(b),
  }
}
