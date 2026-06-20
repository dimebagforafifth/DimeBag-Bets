/**
 * The configurable margin step of the SGO pricing pipeline (math half).
 *
 * Pipeline:  SGO normalize → devig (devig.ts) → applyMargin (here) → [Lane B gate] → publish.
 *
 * `applyMargin` takes a market's TRUE (de-vigged) probabilities and re-prices them under an
 * operator's hold posture: a base margin in basis points, an optional extra "favorite shade"
 * on the favorite, and a posture preset. The margin MATH is the existing house haircut
 * (`pricing.applyMargin`, `displayDecimal = 1 + (dec−1)(1−m)`) — reused verbatim, so a config of
 * 450 bps with no shade reproduces today's prices EXACTLY (450 bps = the legacy DEFAULT_MARGIN
 * of 0.045). This module only makes the RATE configurable and adds the de-vig front end; it
 * never forks the haircut.
 *
 * It also exposes the POST-MARGIN HOOK that Lane B's override/limit/suspension gate plugs into,
 * after margin and before publish. Pure + dependency-free.
 */

import type { MarketType } from './contract.js'
import { applyMargin as haircutPrice, priceFromDecimal, impliedProbability } from './pricing.js'
import { devig, type DevigMethod } from './devig.js'

/** An operator's hold posture. 'custom' uses the explicit margin settings; the named presets
 *  drive a starting margin + shade (the operator can then switch to custom and fine-tune).
 *  'balanced' sits between sharp and recreational (= today's default 450 bps, no shade) — it is
 *  the posture the collapsed Trading Desk (Lane B) carried over. */
export type PricePosture = 'sharp' | 'balanced' | 'recreational' | 'custom'

/** The margin knobs that drive `applyMargin` — base juice, favorite shade, and the de-vig
 *  method the upstream step used. (A pricing_config row resolves to exactly these.) */
export interface MarginSettings {
  /** Base house margin in basis points (450 = today's 4.5%). */
  marginBps: number
  /** Extra margin in bps applied ONLY to the favorite (the public-money shade). 0 = none. */
  favoriteShadeBps: number
  /** Which de-vig method the upstream step uses. */
  devigMethod: DevigMethod
}

/**
 * Posture presets. SHARP runs thin juice (Pinnacle style, ~250 bps, no shade) to court sharp
 * action; RECREATIONAL runs fatter juice (~550 bps) and shades the favorite, where the public
 * piles in. An operator adopts one as a starting point, then switches to 'custom' to fine-tune.
 */
export const PRICING_POSTURE_PRESETS: Readonly<
  Record<'sharp' | 'balanced' | 'recreational', MarginSettings>
> = {
  sharp: { marginBps: 250, favoriteShadeBps: 0, devigMethod: 'power' },
  // BALANCED — a moderate de-vigged hold (~2.3% on a balanced 2-way). The middle posture.
  balanced: { marginBps: 450, favoriteShadeBps: 0, devigMethod: 'power' },
  // RECREATIONAL — CALIBRATED so the principled pipeline reproduces today's legacy PUBLISHED hold
  // (~7.06% on a -110/-110 2-way). NOTE bps here is the haircut RATE on the fair line, ≈ 2× the
  // resulting hold on a balanced 2-way — so 1318 bps ⇒ ~7% hold, not 13%. See the publish-swap lane.
  recreational: { marginBps: 1318, favoriteShadeBps: 75, devigMethod: 'power' },
}

/** One priced selection out of `applyMargin`. */
export interface PricedOdd {
  /** The true (de-vigged) probability this was priced from. */
  trueProb: number
  /** Effective margin applied to THIS selection (base + favorite shade if it's the favorite). */
  marginBps: number
  decimal: number
  american: number
  /** The with-margin implied probability. Σ over the market − 1 = the book hold. */
  impliedProb: number
  /** True for the market's favorite (highest true prob) — the side the shade lands on. */
  isFavorite: boolean
}

/** Resolve the margin settings actually used: a named posture preset overrides the config;
 *  'custom'/undefined uses the config's explicit knobs. */
export function effectiveSettings(config: MarginSettings, posture?: PricePosture): MarginSettings {
  if (posture && posture !== 'custom') {
    const preset = PRICING_POSTURE_PRESETS[posture]
    if (preset) return preset
  }
  return config
}

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/**
 * Re-apply the house margin to a market's TRUE probabilities → priced odds. Each selection is
 * priced through the existing house haircut at `marginBps/10000`; the favorite additionally
 * carries `favoriteShadeBps`. A named `posture` overrides the config's knobs.
 *
 * At 450 bps with no shade this is byte-identical to the legacy `pricing.applyMargin` on the
 * same price (the haircut math is reused, not reimplemented) — so the default config does not
 * regress current pricing.
 */
export function applyMargin(
  trueProbs: number[],
  config: MarginSettings,
  posture?: PricePosture,
): PricedOdd[] {
  const eff = effectiveSettings(config, posture)
  // The favorite is the shortest price = highest true probability.
  let favIdx = -1
  let favP = -Infinity
  trueProbs.forEach((p, i) => {
    if (p > favP) {
      favP = p
      favIdx = i
    }
  })
  const baseM = eff.marginBps / 10000
  const shadeM = eff.favoriteShadeBps / 10000
  return trueProbs.map((p, i) => {
    const isFavorite = i === favIdx
    const m = baseM + (isFavorite ? shadeM : 0)
    const fair = priceFromDecimal(1 / Math.max(p, 1e-9))
    const priced = haircutPrice(fair, m) // reuse the legacy haircut → 450 bps == today
    return {
      trueProb: p,
      marginBps: eff.marginBps + (isFavorite ? eff.favoriteShadeBps : 0),
      decimal: priced.decimal,
      american: priced.american,
      impliedProb: round(1 / priced.decimal, 4),
      isFavorite,
    }
  })
}

/** The book hold (overround) of a priced market: Σ implied − 1. */
export function bookHold(priced: PricedOdd[]): number {
  return priced.reduce((a, o) => a + o.impliedProb, 0) - 1
}

/* ------------------------- the pipeline + Lane B hook -------------------- */

export interface PipelineContext {
  sportId?: string
  marketType?: MarketType
  eventId?: string
}

/**
 * The POST-MARGIN hook — Lane B's override / limit / suspension gate plugs in here, AFTER
 * applyMargin and BEFORE publish. It receives the priced market + context and returns the
 * market to publish (it may rewrite a price for a manual override, or flag/withhold a
 * suspended selection). Default is identity. // SEAM (Lane B owns the gate implementation.)
 */
export type PostMarginHook = (priced: PricedOdd[], ctx: PipelineContext) => PricedOdd[]

export interface PriceMarketOptions {
  /** Override the config's hold posture for this call (e.g. a Trading Desk preview). */
  posture?: PricePosture
  /** Lane B's gate. Default: identity. */
  hook?: PostMarginHook
  ctx?: PipelineContext
}

/**
 * The full pipeline for ONE market: raw American prices → devig → applyMargin → Lane B's gate
 * hook → priced odds to publish. The de-vig method and margin come from `config` (a resolved
 * pricing_config row), optionally overridden by `opts.posture`.
 */
export function priceMarket(
  rawAmericans: number[],
  config: MarginSettings,
  opts: PriceMarketOptions = {},
): PricedOdd[] {
  const eff = effectiveSettings(config, opts.posture)
  const implied = rawAmericans.map(impliedProbability)
  const trueProbs = devig(implied, eff.devigMethod)
  const priced = applyMargin(trueProbs, eff)
  return opts.hook ? opts.hook(priced, opts.ctx ?? {}) : priced
}
