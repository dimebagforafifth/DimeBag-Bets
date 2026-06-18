/**
 * Record badges — every badge is DERIVED from the verified record, never hand-awarded.
 *
 * Pure: in → out, no state, no I/O. Because each badge is a function of settled-activity
 * facts already on the record, a player or agent has no way to mint one without actually
 * earning it through graded play. Badges are accomplishments (positive/neutral); the record
 * body shows the honest negatives (net, ROI) transparently alongside.
 */

import { formatMoney } from '../games/shared/money.js'
import type { RecordBadge, VerifiedRecord } from './types.js'

/** Compact multiplier label, e.g. 12.5 → "12.5×", 3 → "3×". */
function mult(m: number): string {
  return `${Number(m.toFixed(2))}×`
}

/** Derive the full badge set from an assembled record. Order = display order. */
export function deriveBadges(r: VerifiedRecord): RecordBadge[] {
  const badges: RecordBadge[] = []

  if (r.tier.current.id !== 'none') {
    badges.push({
      id: `tier-${r.tier.current.id}`,
      label: `${r.tier.current.name} tier`,
      detail: `${formatMoney(r.lifetime.wagered)} lifetime wagered`,
      tone: 'gold',
    })
  }

  if (r.streak.currentKind === 'win' && r.streak.current >= 3) {
    badges.push({
      id: 'hot-streak',
      label: 'On fire',
      detail: `${r.streak.current}-win streak, live`,
      tone: 'green',
    })
  }

  if (r.streak.longestWin >= 5) {
    badges.push({
      id: 'iron-run',
      label: 'Iron run',
      detail: `best ${r.streak.longestWin}-win streak`,
      tone: 'gold',
    })
  }

  if (r.lifetime.bets >= 100) {
    badges.push({
      id: 'centurion',
      label: 'Centurion',
      detail: `${r.lifetime.bets} bets settled`,
      tone: 'neutral',
    })
  }

  if (r.lifetime.wagered >= 5_000_000) {
    badges.push({
      id: 'high-roller',
      label: 'High roller',
      detail: `${formatMoney(r.lifetime.wagered)} through the book`,
      tone: 'gold',
    })
  }

  if (r.biggestWin && r.biggestWin.multiplier >= 10) {
    badges.push({
      id: 'big-hit',
      label: 'Big hit',
      detail: `${mult(r.biggestWin.multiplier)} on ${r.biggestWin.game}`,
      tone: 'gold',
    })
  }

  if (r.clv.available && r.clv.sampleSize >= 10 && r.clv.beatRate >= 55) {
    badges.push({
      id: 'sharp',
      label: 'Sharp',
      detail: `beats the close ${Math.round(r.clv.beatRate)}% (${r.clv.sampleSize} priced bets)`,
      tone: 'green',
    })
  }

  if (r.lifetime.roi > 0 && r.lifetime.decided >= 20) {
    badges.push({
      id: 'in-profit',
      label: 'In the green',
      detail: `+${(r.lifetime.roi * 100).toFixed(1)}% ROI over ${r.lifetime.decided} decided`,
      tone: 'green',
    })
  }

  return badges
}
