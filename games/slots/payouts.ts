/**
 * Slots reel strip + computed paytable (CLAUDE.md §4, §7).
 *
 * Three identical reels, each a weighted strip of 6 symbols. A spin wins on
 * three-of-a-kind (the symbol's `pay3`), else "any two cherries" (a small
 * consolation), else nothing (0×, a full loss settled through core).
 *
 * Rather than hand-tune the multipliers, we keep FIXED reel weights and a fixed
 * RELATIVE pay shape, then scale every multiplier by a single factor so the
 * realized RTP equals exactly (1 − edge) — the vig is provably correct and
 * manager-configurable (like Keno/Wheel). Weights are tuned so the raw shape's
 * RTP (~0.922) scales up cleanly to 0.99 with every paying tier staying well
 * above 1× (so a "win" always beats the stake, keeping the money model clean §3).
 *
 *   P(symbol s on one reel) = weight_s / Σ weight
 *   RTP = Σ_s P(s)³ · pay3(s)  +  P(exactly two cherries) · payTwoCherry
 *
 * Realized RTP at the default 1% edge ≈ 0.9905 (rounding to 2dp drifts a hair).
 */

export interface SlotSymbol {
  /** Stable id, used in tests and the legend. */
  key: string
  /** Display glyph (emoji) shown in the reel windows. */
  glyph: string
  /** Reel frequency — higher = more common. Same strip on all three reels. */
  weight: number
  /** RELATIVE three-of-a-kind multiplier, before edge-scaling. */
  base: number
}

/** The reel strip: 6 symbols, common → rare. `cherry` is index 0 and also
 *  triggers the "any two cherries" consolation. */
export const SYMBOLS: SlotSymbol[] = [
  { key: 'cherry', glyph: '🍒', weight: 26, base: 6 },
  { key: 'lemon', glyph: '🍋', weight: 22, base: 9 },
  { key: 'bell', glyph: '🔔', weight: 18, base: 16 },
  { key: 'star', glyph: '⭐', weight: 13, base: 30 },
  { key: 'diamond', glyph: '💎', weight: 8, base: 80 },
  { key: 'seven', glyph: '7️⃣', weight: 3, base: 400 },
]

/** Index of the cherry symbol (the two-of-a-kind consolation symbol). */
export const CHERRY = 0
/** RELATIVE "any two cherries" multiplier, before edge-scaling. */
const TWO_CHERRY_BASE = 2

export interface SlotsHouseConfig {
  /** House edge, e.g. 0.01 = 1%. Manager-configurable. */
  edge: number
}
export const DEFAULT_SLOTS_CONFIG: SlotsHouseConfig = { edge: 0.01 }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Total reel weight (denominator for per-symbol probability). */
export const TOTAL_WEIGHT = SYMBOLS.reduce((a, s) => a + s.weight, 0)

/** P(a single reel lands on symbol index `i`). */
export function symbolProbability(i: number): number {
  return SYMBOLS[i].weight / TOTAL_WEIGHT
}

/** P(exactly two of the three reels are cherries). */
function probExactlyTwoCherries(): number {
  const pc = symbolProbability(CHERRY)
  return 3 * pc * pc * (1 - pc)
}

/** The raw (unscaled) RTP of the fixed pay shape — Σ P(s)³·base + 2-cherry. */
function rawRtp(): number {
  let r = 0
  for (let i = 0; i < SYMBOLS.length; i++) r += symbolProbability(i) ** 3 * SYMBOLS[i].base
  return r + probExactlyTwoCherries() * TWO_CHERRY_BASE
}

/** The single scale factor that fits the raw shape to RTP = (1 − edge). */
function scaleFor(config: SlotsHouseConfig): number {
  return (1 - config.edge) / rawRtp()
}

/**
 * The three-of-a-kind paytable indexed by symbol: each symbol's win multiplier,
 * scaled (and rounded to the penny) so the realized RTP hits (1 − edge).
 */
export function buildPaytable(config: SlotsHouseConfig = DEFAULT_SLOTS_CONFIG): number[] {
  const k = scaleFor(config)
  return SYMBOLS.map((s) => round2(s.base * k))
}

/** The "any two cherries" consolation multiplier, scaled to the same edge. */
export function twoCherryMultiplier(config: SlotsHouseConfig = DEFAULT_SLOTS_CONFIG): number {
  return round2(TWO_CHERRY_BASE * scaleFor(config))
}

/**
 * The win multiplier for a final reel triple (indices into SYMBOLS):
 * three-of-a-kind pays that symbol, else exactly-two-cherries pays the
 * consolation, else 0× (a loss). Pure — drives both engine and verification.
 */
export function multiplierFor(
  reels: readonly number[],
  config: SlotsHouseConfig = DEFAULT_SLOTS_CONFIG,
): number {
  const [a, b, c] = reels
  if (a === b && b === c) return buildPaytable(config)[a]
  const cherries = reels.filter((r) => r === CHERRY).length
  if (cherries === 2) return twoCherryMultiplier(config)
  return 0
}

/** The realized RTP of the (rounded) paytable — Σ P(s)³·pay3 + 2-cherry term. */
export function rtpOf(config: SlotsHouseConfig = DEFAULT_SLOTS_CONFIG): number {
  const table = buildPaytable(config)
  let r = 0
  for (let i = 0; i < SYMBOLS.length; i++) r += symbolProbability(i) ** 3 * table[i]
  return r + probExactlyTwoCherries() * twoCherryMultiplier(config)
}
