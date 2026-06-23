/**
 * The Trading Desk hold readout — for a market, the TRUE probabilities (de-vigged from the raw
 * feed prices) vs the PUBLISHED odds vs the HOLD% (the book's theoretical margin = overround).
 *
 * hold% = Σ(implied prob of published odds) − 1 = Σ(published) − Σ(true), since de-vigging
 * normalizes the true probs to sum to 1. So "hold == published − true" by construction.
 *
 * Uses lib/odds/pricing's de-vig today; // SEAM (Lane A): swap to A's method-aware
 * devig(impliedProbs, method) using the market's configured de-vig method when that lands.
 */

import type { NormalizedMarket } from '../../lib/odds/contract.js'
import { devig, impliedProbability } from '../../lib/odds/pricing.js'

export interface SelectionHold {
  selectionId: string
  side: string
  trueProb: number
  publishedProb: number
  publishedAmerican: number
}

export interface MarketHold {
  marketId: string
  selections: SelectionHold[]
  /** Σ published implied − 1 (the overround). */
  holdPct: number
  /** Σ true probs (≈ 1 for a coherent de-vig). */
  trueSum: number
  /** Σ published implied. */
  publishedSum: number
}

/** Compute the hold readout for one market from its raw + published prices. */
export function marketHold(market: NormalizedMarket): MarketHold {
  const raws = market.selections.map((s) => s.priceRaw.american)
  const trueProbs = devig(raws)
  const selections: SelectionHold[] = market.selections.map((s, i) => ({
    selectionId: s.selectionId,
    side: s.side,
    trueProb: trueProbs[i] ?? 0,
    publishedProb: impliedProbability(s.priceDisplay.american),
    publishedAmerican: s.priceDisplay.american,
  }))
  const publishedSum = selections.reduce((a, s) => a + s.publishedProb, 0)
  const trueSum = selections.reduce((a, s) => a + s.trueProb, 0)
  return {
    marketId: market.marketId,
    selections,
    holdPct: publishedSum - 1,
    trueSum,
    publishedSum,
  }
}
