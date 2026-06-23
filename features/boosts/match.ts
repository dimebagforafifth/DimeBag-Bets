/**
 * Pure slip-qualification — does a slip match a boost's qualifier? Reads only the existing
 * slip/SGP data (legs, mode, combined decimal); writes nothing, moves no money. The bonus engine
 * has no slip concept, so this is the layer that decides which BETS a boost applies to.
 */

import { isSameGame, type SlipLeg, type SlipMode } from '../../app/book/slip.js'
import type { BoostDef, BoostQualifier } from './types.js'

/** The minimal slip shape a qualifier reads — a BookBet (or a live slip) satisfies it. */
export interface QualifyingSlip {
  legs: SlipLeg[]
  mode: SlipMode
  /** The combined/locked decimal (parlay combined, or the single leg's decimal). */
  decimal: number
}

/**
 * Whether a slip qualifies for a boost. Every SET field is ANDed; an empty qualifier matches any
 * sportsbook slip. Sport/market filters require EVERY leg to match (a "basketball boost" wants an
 * all-basketball slip, not a mixed parlay that merely touches basketball).
 */
export function matchesQualifier(q: BoostQualifier, slip: QualifyingSlip): boolean {
  const legs = slip.legs
  if (legs.length === 0) return false
  if (q.minLegs != null && legs.length < q.minLegs) return false
  if (q.sgpOnly && !(slip.mode === 'parlay' && isSameGame(legs))) return false
  if (
    q.sports &&
    q.sports.length > 0 &&
    !legs.every((l) => l.sport != null && q.sports!.includes(l.sport))
  )
    return false
  if (
    q.marketTypes &&
    q.marketTypes.length > 0 &&
    !legs.every((l) => q.marketTypes!.includes(l.marketType))
  )
    return false
  if (q.minDecimal != null && slip.decimal < q.minDecimal) return false
  if (q.maxDecimal != null && slip.decimal > q.maxDecimal) return false
  return true
}

/** The enabled boosts a slip qualifies for. */
export function qualifyingBoosts(slip: QualifyingSlip, defs: readonly BoostDef[]): BoostDef[] {
  return defs.filter((d) => d.enabled && matchesQualifier(d.qualifier, slip))
}

/** The single best ODDS boost for a slip (the highest pct), or null — for the slip price preview. */
export function bestOddsBoost(slip: QualifyingSlip, defs: readonly BoostDef[]): BoostDef | null {
  const odds = qualifyingBoosts(slip, defs)
    .filter((d) => d.boostType === 'odds')
    .sort((a, b) => b.pct - a.pct || a.id.localeCompare(b.id))
  return odds[0] ?? null
}
