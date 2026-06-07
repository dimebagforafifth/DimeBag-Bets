/**
 * Book risk & exposure — the trading-desk view of a market (CLAUDE.md §4).
 *
 * The book takes bets on each outcome of a market. It collects every stake up
 * front; when an outcome wins it pays those backers `stake × decimal` (their
 * stake back plus profit). So the book's net P&L if outcome `i` wins is:
 *
 *   net_i = (total stakes taken) − (stake_i × decimal_i)
 *
 * The **liability** on an outcome is how much the book loses if it wins
 * (a negative net). A balanced book has the same net whoever wins; an unbalanced
 * one is exposed to its worst-case outcome. These pure functions turn the bets
 * taken into exposure, the hedge that balances them, the expected hold against a
 * set of true probabilities, and a simple line-move suggestion to shed risk.
 *
 * Stakes/returns are plain numbers (use integer cents to match the money model).
 */

export interface BookPosition {
  name: string
  /** The decimal price the book laid this outcome at. */
  decimal: number
  /** Total stake the book has taken on this outcome. */
  stake: number
}

export interface OutcomeExposure {
  name: string
  /** Book net P&L if this outcome wins: totalStake − stake × decimal. */
  ifWins: number
  /** Liability = the loss if this outcome wins (0 if the book profits on it). */
  liability: number
}

export interface ExposureReport {
  totalStake: number
  outcomes: OutcomeExposure[]
  /** The book's worst-case net P&L across outcomes (most negative). */
  worstCase: number
  /** The book's best-case net P&L. */
  bestCase: number
  /** The outcome name driving the worst case. */
  worstOutcome: string
  /** True when the book's net is equal across every outcome (within epsilon). */
  balanced: boolean
}

function assertPositions(positions: BookPosition[]): void {
  if (positions.length < 2) throw new Error(`a market needs ≥2 outcomes, got ${positions.length}`)
  for (const p of positions) {
    if (!(p.decimal > 1)) throw new Error(`${p.name}: decimal must be > 1, got ${p.decimal}`)
    if (!(p.stake >= 0)) throw new Error(`${p.name}: stake must be ≥ 0, got ${p.stake}`)
  }
}

/** The book's net P&L for each outcome, plus the worst/best case and balance. */
export function exposure(positions: BookPosition[], epsilon = 1e-6): ExposureReport {
  assertPositions(positions)
  const totalStake = positions.reduce((s, p) => s + p.stake, 0)
  const outcomes: OutcomeExposure[] = positions.map((p) => {
    const ifWins = totalStake - p.stake * p.decimal
    return { name: p.name, ifWins, liability: Math.max(0, -ifWins) }
  })
  const nets = outcomes.map((o) => o.ifWins)
  const worstCase = Math.min(...nets)
  const bestCase = Math.max(...nets)
  const worstOutcome = outcomes[nets.indexOf(worstCase)].name
  return {
    totalStake,
    outcomes,
    worstCase,
    bestCase,
    worstOutcome,
    balanced: bestCase - worstCase <= epsilon * Math.max(1, totalStake),
  }
}

/**
 * The fractions of total stake that make the book perfectly balanced (equal net
 * whoever wins). Balanced when stake_i × decimal_i is constant, i.e.
 * stake_i ∝ 1/decimal_i — the normalised implied probabilities.
 */
export function balancedStakeFractions(decimals: number[]): number[] {
  if (decimals.length < 2) throw new Error(`a market needs ≥2 outcomes, got ${decimals.length}`)
  const inv = decimals.map((d) => {
    if (!(d > 1)) throw new Error(`decimal must be > 1, got ${d}`)
    return 1 / d
  })
  const s = inv.reduce((a, b) => a + b, 0)
  return inv.map((x) => x / s)
}

/**
 * Expected book P&L as a fraction of total stake, given the true probability of
 * each outcome: Σ pᵢ · netᵢ / totalStake. Positive = the book expects to win.
 * With a margin in the prices and money matching the true probabilities this
 * equals the book's edge.
 */
export function expectedHold(positions: BookPosition[], trueProbs: number[]): number {
  assertPositions(positions)
  if (trueProbs.length !== positions.length) {
    throw new Error(`need one probability per outcome (${positions.length}), got ${trueProbs.length}`)
  }
  const probSum = trueProbs.reduce((a, b) => a + b, 0)
  if (Math.abs(probSum - 1) > 0.02) {
    throw new Error(`trueProbs must sum to ~1, got ${probSum.toFixed(4)}`)
  }
  const probs = trueProbs.map((p) => p / probSum) // normalise away small drift
  const report = exposure(positions)
  if (report.totalStake === 0) return 0
  const ev = report.outcomes.reduce((s, o, i) => s + probs[i] * o.ifWins, 0)
  return ev / report.totalStake
}

export interface LineMoveSuggestion {
  /** The over-exposed outcome whose price should be shortened. */
  shorten: string
  reason: string
  moves: { name: string; from: number; to: number }[]
}

/**
 * A simple, transparent line-move to shed risk: shorten the price on the
 * most-exposed outcome (raise its implied probability by `step`) to deter more
 * money on it, and lengthen the others to keep the overround unchanged. A
 * heuristic nudge, not an optimiser — it points the trader the right way.
 */
export function suggestLineMove(positions: BookPosition[], step = 0.02): LineMoveSuggestion | null {
  const report = exposure(positions)
  if (report.balanced) return null

  const q = positions.map((p) => 1 / p.decimal)
  const overroundTotal = q.reduce((a, b) => a + b, 0)
  const worstIdx = positions.findIndex((p) => p.name === report.worstOutcome)
  const othersTotal = overroundTotal - q[worstIdx]

  // raise the worst outcome's implied prob; pull the difference from the others
  // by the SAME fraction (bump / othersTotal) of each, so the overround is
  // preserved AND no outcome can be driven negative. Cap the bump below
  // `othersTotal` (and below the room under 1.0) so the move is always feasible
  // — even on a lopsided market like [1.01, 1000].
  const bump = Math.min(step, (1 - q[worstIdx]) * 0.5, othersTotal * 0.9)
  const shrink = othersTotal > 0 ? bump / othersTotal : 0 // uniform fraction, < 1
  const next = q.map((qi, i) => (i === worstIdx ? qi + bump : qi * (1 - shrink)))

  const moves = positions.map((p, i) => ({
    name: p.name,
    from: p.decimal,
    to: next[i] > 0 && next[i] < 1 ? 1 / next[i] : p.decimal,
  }))

  return {
    shorten: report.worstOutcome,
    reason: `worst-case ${report.worstCase.toFixed(0)} if ${report.worstOutcome} wins; shorten it to deter more money`,
    moves,
  }
}
