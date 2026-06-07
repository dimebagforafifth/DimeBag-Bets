/**
 * Hedging & stake-limit tools (CLAUDE.md §4).
 *
 * Two practical jobs:
 *  - bettor side: given an open bet, what stake on the OTHER outcome locks an
 *    equal profit whoever wins (`hedgeToLock`), and what does any chosen hedge
 *    stake pay out (`evaluateHedge`)?
 *  - book side: what's the largest stake the book can accept on an outcome
 *    without its liability breaching a cap (`maxBookStake`)?
 *
 * Pure functions on plain numbers; stakes/profits are in points (integer cents
 * to match the money model).
 */

export interface HedgeResult {
  /** Stake on the opposite outcome that equalises the result. */
  hedgeStake: number
  /** The profit locked in whichever outcome wins. */
  lockedProfit: number
}

function assertBet(stake: number, decimal: number, label = 'decimal'): void {
  if (!(stake >= 0) || !Number.isFinite(stake)) throw new Error(`stake must be ≥ 0, got ${stake}`)
  if (!(decimal > 1) || !Number.isFinite(decimal)) throw new Error(`${label} must be > 1, got ${decimal}`)
}

/**
 * The hedge stake on the opposite outcome that locks an equal profit whoever
 * wins. Equalising
 *   open wins:  openStake·(openDecimal − 1) − hedgeStake
 *   hedge wins: hedgeStake·(hedgeDecimal − 1) − openStake
 * gives `hedgeStake = openStake · openDecimal / hedgeDecimal`.
 */
export function hedgeToLock(openStake: number, openDecimal: number, hedgeDecimal: number): HedgeResult {
  assertBet(openStake, openDecimal, 'openDecimal')
  if (!(hedgeDecimal > 1) || !Number.isFinite(hedgeDecimal)) {
    throw new Error(`hedgeDecimal must be > 1, got ${hedgeDecimal}`)
  }
  const hedgeStake = (openStake * openDecimal) / hedgeDecimal
  const lockedProfit = openStake * (openDecimal - 1) - hedgeStake
  return { hedgeStake, lockedProfit }
}

export interface HedgeOutcomes {
  profitIfOpenWins: number
  profitIfHedgeWins: number
  /** The guaranteed profit (the worse of the two); ≥ 0 means risk-free. */
  guaranteed: number
}

/**
 * Evaluate ANY hedge stake (not just the locking one) — useful for a partial
 * hedge. Returns the net P&L under each outcome and the guaranteed floor.
 */
export function evaluateHedge(
  openStake: number,
  openDecimal: number,
  hedgeStake: number,
  hedgeDecimal: number,
): HedgeOutcomes {
  assertBet(openStake, openDecimal, 'openDecimal')
  assertBet(hedgeStake, hedgeDecimal, 'hedgeDecimal')
  const profitIfOpenWins = openStake * (openDecimal - 1) - hedgeStake
  const profitIfHedgeWins = hedgeStake * (hedgeDecimal - 1) - openStake
  return {
    profitIfOpenWins,
    profitIfHedgeWins,
    guaranteed: Math.min(profitIfOpenWins, profitIfHedgeWins),
  }
}

/**
 * The largest additional stake the book can accept on an outcome priced at
 * `decimal` without its liability on that outcome breaching `liabilityCap`.
 * A bet of stake `s` adds `s·(decimal − 1)` of liability (the profit paid if it
 * wins), so `maxStake = (cap − currentLiability) / (decimal − 1)`, floored at 0.
 */
export function maxBookStake(liabilityCap: number, decimal: number, currentLiability = 0): number {
  if (!(decimal > 1) || !Number.isFinite(decimal)) throw new Error(`decimal must be > 1, got ${decimal}`)
  if (!(liabilityCap >= 0)) throw new Error(`liabilityCap must be ≥ 0, got ${liabilityCap}`)
  return Math.max(0, (liabilityCap - currentLiability) / (decimal - 1))
}
