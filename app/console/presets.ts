/**
 * House presets — three ready-made operating profiles a new manager can apply in one
 * click (CLAUDE.md §2 fast/clean, §4 honest). Each bundles a HOUSE CONFIG (the target
 * RTP applied to every adjustable casino game) + RISK posture (credit-utilization
 * alert, exposure cap, default credit line, settlement cadence) + STARTER PROMO
 * TEMPLATES (suggested bonuses the operator can run from the Promotions tab).
 *
 * `applyPreset` writes ONLY through existing public setters — the edge store (which
 * feeds each game's real payout math through core) and the settings store. It moves no
 * money and creates no bonuses; the promo templates are surfaced as suggestions, never
 * auto-granted (granting stays a deliberate act on the Promotions page).
 */

import { clampRtp } from '../../games/shared/edge.js'
import { GAMES } from '../games.js'
import { isAdjustable } from '../edge-config.js'
import { setRtp } from '../edge-store.js'
import {
  setDefaultCreditLimit,
  setRiskCreditUtil,
  setRiskExposureCap,
  setSettlementPeriodDays,
} from '../settings-store.js'

export type PresetKey = 'conservative' | 'balanced' | 'aggressive'

/** A suggested bonus the wizard surfaces; applied later from Promotions (not here). */
export interface PromoTemplate {
  name: string
  type: 'freeplay' | 'bonus'
  /** Suggested amount per player, in cents. */
  cents: number
  note: string
}

export interface HousePreset {
  key: PresetKey
  label: string
  blurb: string
  /** Target RTP for every adjustable game (1 − house edge). */
  rtp: number
  /** Flag a player at/above this fraction of their credit line. */
  creditUtil: number
  /** Book exposure alert cap in cents (null = off). */
  exposureCap: number | null
  /** Default credit line for newly recruited members, in cents. */
  defaultCreditLimit: number
  /** Settlement cadence in days. */
  settlementPeriodDays: number
  promos: PromoTemplate[]
}

/** Profiles span a coherent risk-appetite spectrum: low edge + tight controls →
 *  max edge + loose controls. RTP values sit inside RTP_POLICY (95–100%). */
export const PRESETS: Record<PresetKey, HousePreset> = {
  conservative: {
    key: 'conservative',
    label: 'Conservative',
    blurb: 'Small edge, tight credit, early alerts. Protect the book; grow slowly.',
    rtp: 0.99,
    creditUtil: 0.7,
    exposureCap: 50_000,
    defaultCreditLimit: 10_000,
    settlementPeriodDays: 7,
    promos: [
      { name: 'Welcome free play', type: 'freeplay', cents: 1_000, note: 'New player on signup.' },
      { name: 'Weekly reload', type: 'bonus', cents: 500, note: 'Small nudge to return.' },
    ],
  },
  balanced: {
    key: 'balanced',
    label: 'Balanced',
    blurb: 'A standard hold with moderate credit and alerts. The sensible default.',
    rtp: 0.97,
    creditUtil: 0.8,
    exposureCap: 200_000,
    defaultCreditLimit: 20_000,
    settlementPeriodDays: 7,
    promos: [
      { name: 'Welcome free play', type: 'freeplay', cents: 2_500, note: 'New player on signup.' },
      { name: 'Weekly reload', type: 'bonus', cents: 1_000, note: 'Keep the week active.' },
      { name: 'Win-back', type: 'freeplay', cents: 1_500, note: 'Re-engage a dormant player.' },
    ],
  },
  aggressive: {
    key: 'aggressive',
    label: 'Aggressive',
    blurb: 'Max edge, loose credit, late alerts. Push growth; carry more risk.',
    rtp: 0.95,
    creditUtil: 0.9,
    exposureCap: null,
    defaultCreditLimit: 50_000,
    settlementPeriodDays: 14,
    promos: [
      { name: 'Welcome free play', type: 'freeplay', cents: 5_000, note: 'Big new-player hook.' },
      { name: 'Weekly reload', type: 'bonus', cents: 2_500, note: 'Strong return incentive.' },
      { name: 'Win-back', type: 'freeplay', cents: 2_500, note: 'Re-engage a dormant player.' },
      { name: 'VIP boost', type: 'bonus', cents: 10_000, note: 'Reward your top players.' },
    ],
  },
}

export const PRESET_LIST: HousePreset[] = [
  PRESETS.conservative,
  PRESETS.balanced,
  PRESETS.aggressive,
]

/** The adjustable games a preset's RTP is applied to (those with a single tunable edge). */
export function adjustableGameKeys(): string[] {
  return GAMES.filter((g) => g.supportsAdjustableEdge && isAdjustable(g.key)).map((g) => g.key)
}

/**
 * Apply a preset's house + risk config through the public setters. Returns the preset
 * so the caller (the wizard) can record it and show the starter promos. Side effects
 * only touch config stores — no money, no game logic.
 */
export function applyPreset(key: PresetKey): HousePreset {
  const p = PRESETS[key]
  const rtp = clampRtp(p.rtp)
  for (const gameKey of adjustableGameKeys()) setRtp(gameKey, rtp)
  setRiskCreditUtil(p.creditUtil)
  setRiskExposureCap(p.exposureCap)
  setDefaultCreditLimit(p.defaultCreditLimit)
  setSettlementPeriodDays(p.settlementPeriodDays)
  return p
}
