/**
 * Cases paytable + house edge (CLAUDE.md §4, §7).
 *
 * Opening a case lands on exactly ONE tier, chosen by a single float over the
 * tiers' cumulative probability weights. The realized RTP is therefore just the
 * probability-weighted mean of the tier multipliers, Σ P·m.
 *
 * Rather than hardcode a published table, the multipliers are COMPUTED so that
 * Σ P·m == (1 − edge) by construction — the 1% vig is provably correct and
 * manager-configurable (like Keno/Wheel). Risk levels reshape only the
 * volatility (how rare the big tiers are, how high the jackpot climbs), never
 * the edge.
 *
 * Construction (mirrors Keno):
 *  - each risk has a fixed set of probability WEIGHTS (one per tier, summing to
 *    1) and a RAW multiplier SHAPE (relative sizes of the paying tiers);
 *  - the lowest tier (index 0) is the 0× "blank" — a full loss;
 *  - we drop the smallest paying tiers until the rest fit under the target
 *    return, then scale the remaining paying multipliers UP by a constant so the
 *    weighted mean equals exactly (1 − edge). Scaling by a constant ≥ 1 keeps
 *    every paying tier above 1×, so a "win" always returns more than the stake
 *    and the core money model stays clean (§3).
 */

export type CasesRisk = 'low' | 'medium' | 'high'
export const RISKS: CasesRisk[] = ['low', 'medium', 'high']

export interface CasesHouseConfig {
  /** House edge, e.g. 0.01 = 1%. Manager-configurable. */
  edge: number
}
export const DEFAULT_CASES_CONFIG: CasesHouseConfig = { edge: 0.01 }

/** A paying tier must return more than the stake (keeps wins > 1× — §3). */
const MIN_PAY = 1.1

/** One landing tier: its probability and the multiplier it pays. */
export interface Tier {
  /** Probability of landing on this tier in [0,1]. */
  probability: number
  /** Payout multiplier (0 = blank/loss). */
  multiplier: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The raw curve for a risk: index 0 is the 0× blank, the rest are RELATIVE
 * winning shapes (scaled to fit the edge below). `weights` are the landing
 * probabilities (sum to 1) — higher risk pushes more weight onto the blank and
 * makes the top tiers far rarer but far larger.
 */
interface RawCurve {
  weights: number[]
  /**
   * Each tier's shape (ascending by index):
   *  - 0          → the blank (0×, a full loss);
   *  - 0 < s ≤ 1  → a FIXED partial return — you get back exactly that fraction of
   *                 the stake (e.g. 0.4×). Not scaled; pays no edge of its own;
   *  - s > 1      → a relative WIN shape, scaled by a constant so the table hits
   *                 the target return (see buildTiers).
   */
  shape: number[]
}

const CURVES: Record<CasesRisk, RawCurve> = {
  // Low: most opens return SOMETHING — a 0.5×/0.8× partial or a small win; blanks
  // are uncommon and the top hit is modest. Calm, low volatility.
  low: {
    weights: [0.1, 0.3, 0.3, 0.2, 0.08, 0.02],
    shape: [0, 0.5, 0.8, 2, 4, 12],
  },
  // Medium: a balanced ladder — a chunk of blanks, a 0.4× partial cushion, then a
  // proper win ladder up to a real jackpot.
  medium: {
    weights: [0.34, 0.2, 0.28, 0.12, 0.05, 0.01],
    shape: [0, 0.4, 2.2, 3.5, 8, 30],
  },
  // High: mostly blanks with a small 0.4× partial, but the tail reaches a huge
  // jackpot. Max volatility.
  high: {
    weights: [0.5967, 0.14, 0.16, 0.07, 0.025, 0.008, 0.0003],
    shape: [0, 0.4, 4, 9, 25, 120, 1500],
  },
}

/**
 * The tier table for a risk under a house config: an array of
 * { probability, multiplier }. Probabilities sum to 1; index 0 is the 0× blank.
 *
 * Sub-unit tiers (0 < shape ≤ 1) are FIXED partial returns (e.g. 0.4×) — so a
 * "miss" isn't always a total loss. They contribute a fixed amount to the return.
 * The WIN tiers (shape > 1) are then scaled by a single constant k so the TOTAL
 * weighted return equals exactly (1 − edge): k absorbs only what the partials
 * leave, i.e. k·Σ(P·shape over wins) == (1 − edge) − Σ(P·partial). The smallest
 * win is dropped to a blank and the rest re-scaled if it can't clear MIN_PAY, so
 * every WIN stays above 1× and the core money model stays clean (§3).
 */
export function buildTiers(
  risk: CasesRisk,
  config: CasesHouseConfig = DEFAULT_CASES_CONFIG,
): Tier[] {
  const curve = CURVES[risk]
  const weights = curve.weights
  const target = 1 - config.edge // desired Σ P·m across all tiers

  // Fixed partial returns (0 < shape ≤ 1) pay exactly their shape; their return
  // contribution is fixed and the win-scaling works around it.
  let fixedContribution = 0
  for (let i = 0; i < weights.length; i++) {
    if (curve.shape[i] > 0 && curve.shape[i] <= 1) fixedContribution += weights[i] * curve.shape[i]
  }

  // Win tier indices (shape > 1), smallest first — these get scaled by k.
  let paying = curve.shape
    .map((s, i) => ({ i, s }))
    .filter((t) => t.s > 1)
    .sort((a, b) => a.s - b.s)
    .map((t) => t.i)

  for (;;) {
    // The constant k so the wins supply exactly the return the partials don't.
    let denom = 0
    for (const i of paying) denom += weights[i] * curve.shape[i]
    const remaining = target - fixedContribution
    const k = denom > 0 ? remaining / denom : 0

    const mult = new Array(weights.length).fill(0)
    for (let i = 0; i < weights.length; i++) {
      if (curve.shape[i] > 0 && curve.shape[i] <= 1) mult[i] = curve.shape[i] // fixed partials
    }
    for (const i of paying) mult[i] = k * curve.shape[i] // scaled wins

    // Lowest WIN must clear MIN_PAY; otherwise drop it (→ a blank) and re-scale so
    // the remaining (bigger) wins absorb the return.
    const lowest = paying[0]
    if (paying.length <= 1 || mult[lowest] >= MIN_PAY) {
      return weights.map((p, i) => ({
        probability: p,
        multiplier: mult[i] > 0 ? round2(mult[i]) : 0,
      }))
    }
    paying = paying.slice(1)
  }
}

/** The realized RTP of a (rounded) tier table — Σ P(tier)·multiplier(tier). */
export function rtpOf(risk: CasesRisk, config: CasesHouseConfig = DEFAULT_CASES_CONFIG): number {
  return buildTiers(risk, config).reduce((acc, t) => acc + t.probability * t.multiplier, 0)
}

/** The cumulative-probability boundaries used to pick a tier from one float. */
export function cumulativeWeights(tiers: Tier[]): number[] {
  const cum: number[] = []
  let acc = 0
  for (const t of tiers) {
    acc += t.probability
    cum.push(acc)
  }
  return cum
}
