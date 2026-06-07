/**
 * The single place that knows how each adjustable-edge game expresses its house
 * edge, so a manager's chosen RTP becomes that game's REAL houseConfig — fed
 * straight into its payout math and settled through `core` (CLAUDE.md §3), never
 * a separate disconnected number.
 *
 * Each entry carries the game's own DEFAULT config + which field holds the edge,
 * so: (1) the native RTP is read from the live default (not a hand-copied value),
 * and (2) building a config clones the default and overrides ONLY the edge field,
 * preserving siblings like Mines' rounding policy or Crash's discretionary spread.
 *
 * Games NOT listed here have a structural/canonical or skill-dependent edge
 * (Roulette, Baccarat, Sic Bo, Three-Card Poker, Blackjack, Video Poker) where a
 * single RTP doesn't cleanly apply — `houseConfigFor` returns null for them.
 */

import { rtpToEdge, edgeToRtp } from '../games/shared/edge.js'
import { DEFAULT_DICE_CONFIG } from '../games/dice/index.js'
import { DEFAULT_HOUSE_CONFIG as DEFAULT_MINES_CONFIG } from '../games/mines/index.js'
import { DEFAULT_CRASH_CONFIG } from '../games/crash/index.js'
import { DEFAULT_LIMBO_CONFIG } from '../games/limbo/index.js'
import { DEFAULT_KENO_CONFIG } from '../games/keno/index.js'
import { DEFAULT_WHEEL_CONFIG } from '../games/wheel/index.js'
import { DEFAULT_HILO_CONFIG } from '../games/hilo/index.js'
import { DEFAULT_CHICKEN_CONFIG } from '../games/chickenroad/index.js'
import { DEFAULT_HOUSE_CONFIG as DEFAULT_TOWER_CONFIG } from '../games/dragon-tower/index.js'
import { DEFAULT_HOUSE_CONFIG as DEFAULT_PUMP_CONFIG } from '../games/pump/index.js'
import { DEFAULT_COINFLIP_CONFIG } from '../games/coinflip/index.js'
import { DEFAULT_DIAMONDS_CONFIG } from '../games/diamonds/index.js'
import { DEFAULT_CASES_CONFIG } from '../games/cases/index.js'
import { DEFAULT_SLOTS_CONFIG } from '../games/slots/index.js'
import { DEFAULT_PLINKO_CONFIG } from '../games/plinko/index.js'

/** Which field in a game's config holds its house edge (0..1). */
type EdgeField = 'edge' | 'houseEdge' | 'baseEdge'

interface EdgeSpec {
  /** The game's own DEFAULT_*_CONFIG (shape varies per game). */
  default: object
  field: EdgeField
}

const SPECS: Record<string, EdgeSpec> = {
  dice: { default: DEFAULT_DICE_CONFIG, field: 'edge' },
  mines: { default: DEFAULT_MINES_CONFIG, field: 'houseEdge' },
  crash: { default: DEFAULT_CRASH_CONFIG, field: 'baseEdge' },
  limbo: { default: DEFAULT_LIMBO_CONFIG, field: 'baseEdge' },
  keno: { default: DEFAULT_KENO_CONFIG, field: 'edge' },
  wheel: { default: DEFAULT_WHEEL_CONFIG, field: 'edge' },
  hilo: { default: DEFAULT_HILO_CONFIG, field: 'edge' },
  chickenroad: { default: DEFAULT_CHICKEN_CONFIG, field: 'edge' },
  'dragon-tower': { default: DEFAULT_TOWER_CONFIG, field: 'houseEdge' },
  pump: { default: DEFAULT_PUMP_CONFIG, field: 'houseEdge' },
  coinflip: { default: DEFAULT_COINFLIP_CONFIG, field: 'edge' },
  diamonds: { default: DEFAULT_DIAMONDS_CONFIG, field: 'edge' },
  cases: { default: DEFAULT_CASES_CONFIG, field: 'edge' },
  slots: { default: DEFAULT_SLOTS_CONFIG, field: 'edge' },
  plinko: { default: DEFAULT_PLINKO_CONFIG, field: 'edge' },
}

/** Whether this game's edge can be tuned by the manager control. */
export function isAdjustable(gameKey: string): boolean {
  return gameKey in SPECS
}

/** The game's native house edge (0..1), read from its live DEFAULT config. */
export function nativeEdge(gameKey: string): number {
  const spec = SPECS[gameKey]
  return spec ? ((spec.default as Record<string, unknown>)[spec.field] as number) : 0
}

/** The game's native RTP (1 − native edge) — the slider's value when unset. */
export function nativeRtp(gameKey: string): number {
  return edgeToRtp(nativeEdge(gameKey))
}

/**
 * The game's REAL houseConfig for a chosen RTP: clone its default and override
 * only the edge field (Crash/Limbo also zero the discretionary spread so the RTP
 * control sets the whole edge). Returns null if the game isn't adjustable.
 */
export function houseConfigFor(gameKey: string, rtp: number): Record<string, unknown> | null {
  const spec = SPECS[gameKey]
  if (!spec) return null
  const cfg: Record<string, unknown> = {
    ...(spec.default as Record<string, unknown>),
    [spec.field]: rtpToEdge(rtp),
  }
  if (spec.field === 'baseEdge') cfg.spread = 0
  return cfg
}
