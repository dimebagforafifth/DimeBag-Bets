/**
 * A shareable summary of a verified record — exportable but ANCHORED to the platform.
 *
 * Pure text builder (no I/O, no clipboard — the UI does the copy). The output names
 * DimeBag-Bets and carries the record fingerprint, so a shared brag points back to the
 * verifiable source rather than being a free-floating, editable claim. Credits only — the
 * footer states there is no cash value.
 */

import { formatMoney } from '../games/shared/money.js'
import { streakLabel } from './streak-label.js'
import type { VerifiedRecord } from './types.js'

function signedPct(fraction: number): string {
  const pct = fraction * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function signedMoney(cents: number): string {
  // formatMoney already renders a leading − for negatives; add + for positive net.
  return cents > 0 ? `+${formatMoney(cents)}` : formatMoney(cents)
}

/** Build the multi-line shareable summary for a record. */
export function shareableSummary(r: VerifiedRecord): string {
  const lines: string[] = []
  lines.push(`${r.name} — DimeBag-Bets verified record`)

  const tierLabel = r.tier.current.id === 'none' ? 'Unranked' : `${r.tier.current.name} tier`
  lines.push(`${tierLabel} · ${r.lifetime.bets} bets · ${r.lifetime.winRate.toFixed(0)}% win rate`)
  lines.push(
    `Net ${signedMoney(r.lifetime.net)} · ROI ${signedPct(r.lifetime.roi)} · ${formatMoney(
      r.lifetime.wagered,
    )} wagered`,
  )

  if (r.streak.current > 0 && r.streak.currentKind !== 'none') {
    lines.push(
      `Current streak: ${streakLabel(r.streak.current, r.streak.currentKind)} (best ${
        r.streak.longestWin
      } W)`,
    )
  }

  if (r.biggestWin) {
    lines.push(
      `Biggest hit: ${Number(r.biggestWin.multiplier.toFixed(2))}× on ${r.biggestWin.game} (${signedMoney(
        r.biggestWin.profit,
      )})`,
    )
  }

  if (r.clv.available) {
    lines.push(`Beats the close ${r.clv.beatRate.toFixed(0)}% (${r.clv.sampleSize} priced bets)`)
  }

  if (r.badges.length) {
    lines.push(`Badges: ${r.badges.map((b) => b.label).join(' · ')}`)
  }

  lines.push(
    `Verified from settled play · fingerprint ${r.integrity.fingerprint.slice(
      0,
      12,
    )} · points-based, no cash value`,
  )
  return lines.join('\n')
}
