/**
 * Same-game-parlay (SGP) conflict rules + slip validation — runs BEFORE pricing so a slip that
 * can't legally be combined never gets a price and never reaches `placeWager`.
 *
 * Two layers:
 *  1. HARD-BLOCK matrix (block_contradictions — ALWAYS on, can't be disabled): combinations that
 *     are mutually exclusive or logically nested and so must never be parlayed (you'd be carrying
 *     a guaranteed loser, or double-counting one outcome). Both sides of a total, both teams'
 *     moneyline, both sides of a spread, a player's Over AND Under on one prop, and nested
 *     prop lines (Over 20.5 + Over 25.5 — the bigger already implies the smaller).
 *  2. CORRELATE rules (the existing SGP correlation engine): surviving same-game legs are NOT
 *     naive-multiplied — they reprice with correlation (same-direction shorter, opposing longer;
 *     slip.ts effectiveSgpCorrelation → lib/odds/pricing.priceSgp).
 *
 * `validateSlip` also dedupes and enforces the per-tenant max-leg cap. The strictness config is a
 * mock/local-default store (off-by-default; no Supabase needed); agents inherit the tenant config
 * and can never drop below block-contradictions. Credits/balance only — this module moves no money.
 */

import type { MarketType } from '../../lib/odds/contract.js'
import { SGP_MAX_LEGS } from '../../lib/odds/pricing.js'
import { createStore, persistedDoc, type Doc } from '../../persistence/index.js'
import type { SlipLeg } from './slip.js'

export type SgpRelation = 'block' | 'correlate'
export type SgpStrictness = 'strict' | 'standard' | 'loose'

/**
 * A configurable rule for an ordered market-type pair within a same-game parlay. `relation`
 * 'block' refuses the combination; 'correlate' lets it through to correlation pricing with
 * `correlation_coeff` (signed: + same-direction shorter, − opposing longer). `sport` '*' = all.
 * NOTE: the hard contradictions (HARD_BLOCK_MATRIX) are immutable and independent of these — a
 * rule can tighten (add a block) but can never turn a contradiction into 'correlate'.
 */
export interface SgpConflictRule {
  market_type_a: MarketType
  market_type_b: MarketType
  /** Whether the rule targets same-side (true) or opposing-side (false) pairs. */
  same_side: boolean
  relation: SgpRelation
  correlation_coeff: number
  sport: string
  scope: 'same_game'
}

/** Per-tenant strictness. `block_contradictions` is structurally `true` — it cannot be disabled. */
export interface SgpStrictnessConfig {
  tenant_id: string
  strictness: SgpStrictness
  block_contradictions: true
  max_legs: number
}

/** Hard ceiling on legs regardless of tenant setting (the engine's SGP cap). */
export const HARD_MAX_LEGS = SGP_MAX_LEGS

/** Each strictness preset's default leg cap. */
export const STRICTNESS_MAX_LEGS: Readonly<Record<SgpStrictness, number>> = {
  strict: 6,
  standard: SGP_MAX_LEGS,
  loose: SGP_MAX_LEGS,
}

export const DEFAULT_STRICTNESS_CONFIG: SgpStrictnessConfig = {
  tenant_id: 'house',
  strictness: 'standard',
  block_contradictions: true,
  max_legs: SGP_MAX_LEGS,
}

/** A read-only, human description of the immutable hard-block matrix (shown in the console tile). */
export interface BlockMatrixRow {
  pair: string
  outcome: string
}
export const HARD_BLOCK_MATRIX: readonly BlockMatrixRow[] = [
  { pair: 'Total — Over + Under (same total, same period)', outcome: 'Blocked — only one can win' },
  { pair: 'Moneyline — both teams', outcome: 'Blocked — opposing outright winners' },
  { pair: 'Spread — both teams', outcome: 'Blocked — opposing sides of one line' },
  {
    pair: 'Player prop — Over + Under (same stat)',
    outcome: 'Blocked — opposing sides of one prop',
  },
  {
    pair: 'Total / Spread / Prop — same side, different lines',
    outcome: 'Blocked — one outcome is nested in the other',
  },
]

export type BlockReason =
  | 'opposing_moneyline'
  | 'opposing_total'
  | 'opposing_spread'
  | 'opposing_prop'
  | 'nested_total'
  | 'nested_spread'
  | 'nested_prop'
  | 'max_legs'

export interface SlipBlock {
  reason: BlockReason
  /** The offending leg keys (a pair, or all legs for max_legs). */
  keys: string[]
  message: string
}

export interface SlipValidation {
  /** True when the slip may proceed to pricing/placement. */
  ok: boolean
  /** Deduped survivors — the legs that should be priced (never the raw input). */
  legs: SlipLeg[]
  blocks: SlipBlock[]
  /** Keys dropped as exact duplicates of an earlier leg. */
  removedDuplicateKeys: string[]
}

/** Directly-opposing sides that can't share a parlay. */
const OPPOSITE_SIDE: Readonly<Record<string, string>> = {
  over: 'under',
  under: 'over',
  home: 'away',
  away: 'home',
  yes: 'no',
  no: 'yes',
}

/** Classify a same-event pair against the immutable hard-block matrix; null = allowed (correlate). */
function classifyConflict(a: SlipLeg, b: SlipLeg): SlipBlock | null {
  const opposing = OPPOSITE_SIDE[a.side] === b.side
  const samePeriod = a.marketPeriod === b.marketPeriod
  const keys = [a.key, b.key]

  if (a.marketType === 'moneyline' && b.marketType === 'moneyline' && opposing) {
    return {
      reason: 'opposing_moneyline',
      keys,
      message: 'Both teams’ moneyline can’t be combined.',
    }
  }
  // Totals only conflict within the SAME period — a 1st-half total and a full-game total are a
  // legitimate correlated pair across periods, not a contradiction.
  if (a.marketType === 'total' && b.marketType === 'total' && samePeriod) {
    if (opposing) {
      return {
        reason: 'opposing_total',
        keys,
        message: 'Over and Under of the same total can’t be combined.',
      }
    }
    // Same side, same period (Over 220.5 + Over 224.5): the harder line already implies the
    // easier one — one outcome priced as two, which would badly overpay.
    if (a.side === b.side) {
      return {
        reason: 'nested_total',
        keys,
        message: 'These total lines are nested — one already implies the other.',
      }
    }
  }
  if (a.marketType === 'spread' && b.marketType === 'spread' && samePeriod) {
    if (opposing) {
      return {
        reason: 'opposing_spread',
        keys,
        message: 'Both sides of the same spread can’t be combined.',
      }
    }
    // Same team, same period (Home −3.5 + Home −7.5): covering the bigger line implies the
    // smaller, so it's nested.
    if (a.side === b.side) {
      return {
        reason: 'nested_spread',
        keys,
        message: 'These spread lines are nested — one already implies the other.',
      }
    }
  }
  if (
    a.marketType === 'prop' &&
    b.marketType === 'prop' &&
    (a.playerId ?? '') === (b.playerId ?? '') &&
    (a.statId ?? '') === (b.statId ?? '')
  ) {
    if (opposing) {
      return {
        reason: 'opposing_prop',
        keys,
        message: 'Over and Under of the same player prop can’t be combined.',
      }
    }
    // Same player, same stat, same side, DIFFERENT line → nested: Over 25.5 already implies
    // Over 20.5 (and Under 20.5 implies Under 25.5), so it's one outcome priced as two.
    if (a.side === b.side && (a.line ?? null) !== (b.line ?? null)) {
      return {
        reason: 'nested_prop',
        keys,
        message: 'These prop lines are nested — one already implies the other.',
      }
    }
  }
  return null
}

/**
 * Validate a slip's legs BEFORE pricing. Dedupes exact-duplicate legs, runs the immutable
 * hard-block matrix over every same-event pair, and enforces the tenant leg cap. The returned
 * `legs` (deduped survivors) are what should be priced — never the raw input. When `ok` is
 * false the slip must not be priced or placed; the blocks carry the offending leg keys so the UI
 * can flag them. Pure — no money, no I/O.
 */
export function validateSlip(
  legs: SlipLeg[],
  config: SgpStrictnessConfig = currentStrictnessConfig(),
): SlipValidation {
  // 1. Dedupe by selection key.
  const seen = new Set<string>()
  const deduped: SlipLeg[] = []
  const removedDuplicateKeys: string[] = []
  for (const l of legs) {
    if (seen.has(l.key)) {
      removedDuplicateKeys.push(l.key)
      continue
    }
    seen.add(l.key)
    deduped.push(l)
  }

  const blocks: SlipBlock[] = []

  // 2. Hard-block matrix over same-event pairs (block_contradictions, always on).
  for (let i = 0; i < deduped.length; i++) {
    for (let j = i + 1; j < deduped.length; j++) {
      if (deduped[i].eventId !== deduped[j].eventId) continue
      const block = classifyConflict(deduped[i], deduped[j])
      if (block) blocks.push(block)
    }
  }

  // 3. Leg cap (on the deduped survivors).
  const cap = Math.min(config.max_legs, HARD_MAX_LEGS)
  if (deduped.length > cap) {
    blocks.push({
      reason: 'max_legs',
      keys: deduped.map((l) => l.key),
      message: `A parlay can have at most ${cap} legs.`,
    })
  }

  return { ok: blocks.length === 0, legs: deduped, blocks, removedDuplicateKeys }
}

/** Player-facing one-liner for the first block on a slip (or null when clean). */
export function firstBlockMessage(validation: SlipValidation): string | null {
  return validation.blocks[0]?.message ?? null
}

/* ─────────────────────────── strictness config store ────────────────────────
 * Mock/local default (persisted under 'dimebag'); needs no Supabase keys. block_contradictions
 * is forced true on every read/write so it can never be turned off. The console tile edits this.
 */

const store = createStore({ namespace: 'dimebag' })
const DOC: Doc<SgpStrictnessConfig> = persistedDoc<SgpStrictnessConfig>(store, 'sgp.strictness', {
  version: 1,
  initial: DEFAULT_STRICTNESS_CONFIG,
})

let config: SgpStrictnessConfig = { ...DOC.load(), block_contradictions: true }
const listeners = new Set<() => void>()
let version = 0

function notify(): void {
  version += 1
  listeners.forEach((l) => l())
}

export function subscribeSgpRules(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getSgpRulesVersion(): number {
  return version
}
export function currentStrictnessConfig(): SgpStrictnessConfig {
  return config
}

/** Set the tenant strictness (also resets max_legs to that preset's default). */
export function setStrictness(strictness: SgpStrictness): void {
  config = {
    ...config,
    strictness,
    max_legs: STRICTNESS_MAX_LEGS[strictness],
    block_contradictions: true,
  }
  DOC.save(config)
  notify()
}

/** Set the per-tenant max legs (clamped to [2, HARD_MAX_LEGS]). */
export function setMaxLegs(n: number): void {
  const max_legs = Math.max(2, Math.min(HARD_MAX_LEGS, Math.round(n)))
  config = { ...config, max_legs, block_contradictions: true }
  DOC.save(config)
  notify()
}

/** Test reset. */
export function __resetSgpRules(): void {
  config = { ...DEFAULT_STRICTNESS_CONFIG }
  DOC.save(config)
  notify()
}
