/**
 * Wheel payouts (CLAUDE.md §7).
 *
 * The spin lands on a uniformly-random segment, so the realized RTP is just the
 * MEAN of the segment multipliers. Rather than copy Stake's exact per-segment
 * tables (not publicly verifiable), we BUILD each table to Stake's published
 * shape and an exact (1 − edge) mean, so the 1% house edge is provably correct
 * and manager-configurable (like Keno/Dice):
 *   - high  → one big pocket = (1 − edge) × segments, the rest 0× (max volatility);
 *   - medium→ a minority of winning pockets on escalating tiers, the rest 0×;
 *   - low   → most pockets win a little, a few 0× (low volatility).
 * Every table's mean equals (1 − edge) before rounding.
 */

export type WheelRisk = 'low' | 'medium' | 'high'
export const RISKS: WheelRisk[] = ['low', 'medium', 'high']
export const SEGMENT_OPTIONS = [10, 20, 30, 40, 50] as const

export interface WheelHouseConfig {
  /** House edge, e.g. 0.01 = 1%. Manager-configurable. */
  edge: number
}
export const DEFAULT_WHEEL_CONFIG: WheelHouseConfig = { edge: 0.01 }

const round2 = (n: number) => Math.round(n * 100) / 100

function assertSegments(segments: number): void {
  if (!SEGMENT_OPTIONS.includes(segments as (typeof SEGMENT_OPTIONS)[number])) {
    throw new Error(`segments must be one of ${SEGMENT_OPTIONS.join(', ')}, got ${segments}`)
  }
}

/** Raw winning-pocket values (all > 1) before fitting, per Stake's volatility
 *  shape. high = one jackpot; medium = an escalating ladder; low = gentle. */
function rawWinners(risk: WheelRisk, segments: number): number[] {
  if (risk === 'high') return [1] // a single pocket, scaled up to the jackpot below
  const winners = Math.max(1, Math.round(segments * (risk === 'low' ? 0.7 : 0.5)))
  const vals: number[] = []
  for (let k = 0; k < winners; k++) {
    if (risk === 'low') {
      vals.push(k % 5 === 0 ? 1.5 : 1.2) // gentle two-tier
    } else {
      const t = k / winners // escalating ladder, a rare jackpot at the top
      vals.push(t < 0.6 ? 1.5 : t < 0.85 ? 2 : t < 0.95 ? 4 : 10)
    }
  }
  return vals
}

/**
 * The multiplier for each segment (length === segments), with mean exactly
 * (1 − edge): start from the raw winners, drop the smallest until they fit under
 * the target total, then scale the rest UP to hit it — so every winning pocket
 * stays above 1× and the rest are 0×.
 */
export function buildWheel(
  risk: WheelRisk,
  segments: number,
  config: WheelHouseConfig = DEFAULT_WHEEL_CONFIG,
): number[] {
  assertSegments(segments)
  const target = (1 - config.edge) * segments // desired total across all pockets
  const vals = rawWinners(risk, segments).sort((a, b) => a - b) // ascending
  let sum = vals.reduce((a, b) => a + b, 0)
  while (vals.length > 1 && sum > target) sum -= vals.shift()! // drop the smallest winners
  const scale = target / sum // ≥ 1, so a scaled winner never falls to/under 1×
  const winners = vals.map((v) => round2(v * scale))

  const out = new Array(segments).fill(0)
  // Winner slots are spread evenly around the wheel; the VALUES dealt into them are
  // interleaved (spreadWinners) so equal multipliers — and so their colours — don't
  // clump into one arc. The 0× pockets fill the gaps and separate the winners.
  const ordered = spreadWinners(winners)
  ordered.forEach((v, k) => {
    out[Math.floor((k * segments) / ordered.length)] = v
  })
  return out
}

/**
 * Deal a multiset of winner multipliers into an order where each distinct value is
 * spaced as evenly as possible around the ring — rarest values placed first, so the
 * big colourful multipliers dot around the wheel and the common low one fills the
 * gaps, instead of all the equal multipliers (one colour) landing in a single arc.
 */
function spreadWinners(winners: number[]): number[] {
  const n = winners.length
  if (n <= 2) return winners
  const counts = new Map<number, number>()
  for (const v of winners) counts.set(v, (counts.get(v) ?? 0) + 1)
  // rarest first (then higher value first) so scarce, vivid tiers get clean spacing
  const distinct = [...counts.entries()].sort((a, b) => a[1] - b[1] || b[0] - a[0])
  const out: (number | null)[] = new Array(n).fill(null)
  for (const [value, count] of distinct) {
    for (let j = 0; j < count; j++) {
      let pos = Math.round((j + 0.5) * (n / count)) % n
      while (out[pos] != null) pos = (pos + 1) % n // nearest free slot on collision
      out[pos] = value
    }
  }
  return out as number[]
}

/** The realized RTP of a (rounded) table — its mean multiplier. */
export function rtpOf(
  risk: WheelRisk,
  segments: number,
  config: WheelHouseConfig = DEFAULT_WHEEL_CONFIG,
): number {
  const t = buildWheel(risk, segments, config)
  return t.reduce((a, b) => a + b, 0) / t.length
}

/** Distinct multipliers in a table with how many segments carry each — the legend. */
export function legend(table: number[]): { multiplier: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const m of table) counts.set(m, (counts.get(m) ?? 0) + 1)
  return [...counts.entries()]
    .map(([multiplier, count]) => ({ multiplier, count }))
    .sort((a, b) => a.multiplier - b.multiplier)
}
