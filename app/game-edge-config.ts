/**
 * Per-game house-edge BANDS (PART 2) — replaces the old flat 5% ceiling (RTP ≥ 0.95) with a
 * realistic min/max/default band PER GAME, in basis points of edge (100 bps = 1.00% edge).
 *
 * A single 5% cap is wrong for a real casino: blackjack should never carry more than ~2%, while
 * keno legitimately runs 15–30% and a money-wheel 8–24%. Each game gets a credible band whose
 * DEFAULT sits near the real-world value (not the max), and variable games (sic bo, roulette,
 * craps) carry `bet_type_overrides` so an exotic bet can band far higher than the even-money one.
 *
 * Pure + dependency-free: this is the clamp authority. `clampEdgeBps(game, input)` is what every
 * setter routes through, so no edge can be configured outside its game's band. The edge only ever
 * scales the payout/multiplier mapping — NEVER the RNG (see the provably-fair invariance test).
 */

/** 1.00 (100% edge) = 10,000 bps; 1% edge = 100 bps. */
export const BPS_PER_UNIT = 10_000

/** A min/max/default edge band, in basis points. */
export interface GameEdgeBand {
  edge_min_bps: number
  edge_max_bps: number
  edge_default_bps: number
}

/** The full per-game edge config (the `game_edge_config` schema). */
export interface GameEdgeConfig extends GameEdgeBand {
  game_id: string
  /** The currently-set edge (defaults to `edge_default_bps`). */
  edge_current_bps: number
  /** Per-bet-type bands for variable games (sic bo even-money vs triple, roulette EU vs US, …). */
  bet_type_overrides?: Record<string, GameEdgeBand>
}

const b = (
  game_id: string,
  edge_min_bps: number,
  edge_max_bps: number,
  edge_default_bps: number,
  bet_type_overrides?: Record<string, GameEdgeBand>,
): GameEdgeConfig => ({
  game_id,
  edge_min_bps,
  edge_max_bps,
  edge_default_bps,
  edge_current_bps: edge_default_bps,
  ...(bet_type_overrides ? { bet_type_overrides } : {}),
})

const ov = (
  edge_min_bps: number,
  edge_max_bps: number,
  edge_default_bps: number,
): GameEdgeBand => ({
  edge_min_bps,
  edge_max_bps,
  edge_default_bps,
})

/**
 * The seed bands (bps of edge). Defaults sit near the credible real-world value, not the max.
 * Keyed by the game registry key. Variable games carry bet_type_overrides.
 */
export const GAME_EDGE_BANDS: Readonly<Record<string, GameEdgeConfig>> = {
  // Table games — tight, skill/structural edges.
  blackjack: b('blackjack', 30, 200, 50),
  baccarat: b('baccarat', 100, 300, 106, { tie: ov(1200, 1600, 1436) }),
  videopoker: b('videopoker', 50, 500, 200),
  craps: b('craps', 100, 300, 140, { props: ov(300, 1670, 1110) }),
  threecardpoker: b('threecardpoker', 200, 750, 337),
  roulette: b('roulette', 200, 700, 526, {
    european: ov(200, 550, 270),
    american: ov(400, 700, 526),
  }),
  sicbo: b('sicbo', 250, 3000, 280, {
    'even-money': ov(100, 250, 250), // ≤ 2.5%
    triple: ov(1000, 3000, 2778), // up to 30%
  }),
  // Crypto-style originals — moderate single-edge games.
  dice: b('dice', 100, 500, 100),
  limbo: b('limbo', 100, 500, 100),
  crash: b('crash', 100, 500, 100),
  mines: b('mines', 100, 500, 100),
  plinko: b('plinko', 100, 800, 200),
  hilo: b('hilo', 100, 500, 150),
  chickenroad: b('chickenroad', 100, 600, 200),
  'dragon-tower': b('dragon-tower', 100, 600, 200),
  pump: b('pump', 100, 600, 200),
  coinflip: b('coinflip', 100, 500, 150),
  diamonds: b('diamonds', 100, 600, 250),
  cases: b('cases', 200, 1200, 400),
  // High-edge games.
  wheel: b('wheel', 800, 2400, 1100),
  'big-six': b('big-six', 800, 2400, 1100),
  keno: b('keno', 1500, 3000, 2500),
  slots: b('slots', 200, 1500, 400),
}

/** A safe fallback band for a game with no entry: the legacy 0–5% edge range. */
export const FALLBACK_BAND: GameEdgeBand = {
  edge_min_bps: 0,
  edge_max_bps: 500,
  edge_default_bps: 100,
}

/** The band that applies to a game (optionally a specific bet type). */
export function bandFor(gameId: string, betType?: string): GameEdgeBand {
  const cfg = GAME_EDGE_BANDS[gameId]
  if (!cfg) return FALLBACK_BAND
  if (betType && cfg.bet_type_overrides?.[betType]) return cfg.bet_type_overrides[betType]
  return cfg
}

/** Whether a game has a configured band (vs the fallback). */
export function hasBand(gameId: string): boolean {
  return gameId in GAME_EDGE_BANDS
}

/**
 * Clamp an edge (bps) into a game's band: `clamp(input, edge_min_bps, edge_max_bps)`. This is the
 * single replacement for the old flat 5% clamp — a manager input outside the band is pulled to
 * the nearest edge of the band (e.g. blackjack 9% → 2%; keno 28% stays; blackjack 28% → 2%).
 * NaN falls back to the band default.
 */
export function clampEdgeBps(gameId: string, inputBps: number, betType?: string): number {
  const band = bandFor(gameId, betType)
  if (!Number.isFinite(inputBps)) return band.edge_default_bps
  return Math.round(Math.min(band.edge_max_bps, Math.max(band.edge_min_bps, inputBps)))
}

/* ───────────────────────────── conversions ─────────────────────────────── */

/** Edge (0..1) → basis points. */
export function edgeToBps(edge: number): number {
  return Math.round(edge * BPS_PER_UNIT)
}
/** Basis points → edge (0..1). */
export function bpsToEdge(bps: number): number {
  return bps / BPS_PER_UNIT
}
/** Basis points of edge → RTP (1 − edge). */
export function bpsToRtp(bps: number): number {
  return 1 - bps / BPS_PER_UNIT
}
/** RTP → basis points of edge. */
export function rtpToBps(rtp: number): number {
  return Math.round((1 - rtp) * BPS_PER_UNIT)
}

/**
 * How a game's edge enters its math — which decides whether the provably-fair invariance
 * ("a fixed seed gives the same OUTCOME at any edge") holds:
 *  - 'payout':       the edge scales the PAYOUT multiplier; the RNG roll is edge-independent, so a
 *                    fixed (server seed, client seed, nonce) yields the SAME outcome at any edge —
 *                    only the payout differs (proven for Dice in game-edge-config.test.ts). This is
 *                    every banded game EXCEPT the two below.
 *  - 'distribution': the edge scales the OUTCOME DISTRIBUTION itself (Stake's Crash/Limbo model:
 *                    crashPoint = draw × (1 − edge); limbo result = (1 − edge) / draw). The
 *                    seed-only draw is fixed and verifiable, but the realised crash point / result
 *                    (and thus win/loss) shifts with the edge — so the invariance does NOT hold for
 *                    these games by design.
 *
 * A 'distribution' round is STILL provably fair, but ONLY if the edge locked at play time is
 * recorded with the round so the verifier can reproduce the outcome.
 * // SEAM (fairness / engine owners): the provably-fair verifier for a 'distribution' game must
 * take the round's LOCKED edge as input (crash/limbo verify against a passed config today — the
 * round RECORD must persist that config). Changing a game's band affects only FUTURE rounds; a
 * settled round is always reproduced from its own locked edge, never the current band.
 */
export type EdgeModel = 'payout' | 'distribution'

export const EDGE_MODEL: Readonly<Record<string, EdgeModel>> = {
  crash: 'distribution',
  limbo: 'distribution',
}

/** The edge model for a game (defaults to 'payout' — edge scales the payout, not the draw). */
export function edgeModelFor(gameId: string): EdgeModel {
  return EDGE_MODEL[gameId] ?? 'payout'
}

/** The live config for a game given its current edge (bps): the schema shape the tile renders. */
export function gameEdgeConfig(
  gameId: string,
  currentBps?: number,
  betType?: string,
): GameEdgeConfig {
  const base = GAME_EDGE_BANDS[gameId] ?? {
    game_id: gameId,
    ...FALLBACK_BAND,
    edge_current_bps: FALLBACK_BAND.edge_default_bps,
  }
  const band = bandFor(gameId, betType)
  const current =
    currentBps == null ? band.edge_default_bps : clampEdgeBps(gameId, currentBps, betType)
  return { ...base, ...band, game_id: gameId, edge_current_bps: current }
}
