/**
 * Server-side outcome resolver registry (CLAUDE.md §6).
 *
 * Maps every game to its pure outcome derivation so the provably-fair AUTHORITY can derive
 * any game's result SERVER-SIDE from the withheld seed — the same role `resolveCrash` already
 * fills for Crash, generalized to all games. This is the missing piece of issue #2: today the
 * server only knows how to derive Crash's outcome; with this registry it can resolve every
 * game, so the seed never has to be handed to the client to compute the result.
 *
 * Imports ONLY each game's pure `fair.ts` (HMAC math, no React/DOM/money), so it drops
 * unchanged into the Vercel serverless function today and a Supabase edge function later.
 * Each resolver takes (serverSeed, clientSeed, nonce, params) and returns the raw fair
 * outcome the game's engine settles against. `params` carries the per-round inputs that are
 * fixed at commit/placement time (mineCount, rows, difficulty, house config, …) and that the
 * outcome legitimately depends on — never anything the player could use to influence it.
 *
 * The derivation is the SAME function the game's published `verify*` helper re-runs, so a
 * server-resolved outcome stays independently verifiable by the player.
 */

import { dealBaccarat } from '../baccarat/fair.js'
import { shuffleDeck } from '../blackjack/fair.js'
import { openCase } from '../cases/fair.js'
import type { CasesRisk, CasesHouseConfig } from '../cases/payouts.js'
import { crashLane } from '../chickenroad/fair.js'
import { coinsUpTo } from '../coinflip/fair.js'
import { crashPointFromSeeds, type CrashHouseConfig } from '../crash/fair.js'
import { drawGems } from '../diamonds/fair.js'
import { rollFromSeeds } from '../dice/fair.js'
import { deriveTower } from '../dragon-tower/fair.js'
import type { TowerDifficulty } from '../dragon-tower/difficulty.js'
import { cardsUpTo } from '../hilo/fair.js'
import { drawNumbers } from '../keno/fair.js'
import { limboFromSeeds, type LimboHouseConfig } from '../limbo/fair.js'
import { deriveMines } from '../mines/fair.js'
import { dropBall } from '../plinko/fair.js'
import { derivePops } from '../pump/fair.js'
import type { PumpDifficulty } from '../pump/multiplier.js'
import { spinPocket } from '../roulette/fair.js'
import { rollDice } from '../sicbo/fair.js'
import { spin } from '../slots/fair.js'
import { dealtDeck as dealThreeCard } from '../threecardpoker/fair.js'
import { dealtDeck as dealVideoPoker } from '../videopoker/fair.js'
import { spinSegment } from '../wheel/fair.js'

/** Every resolvable game id (the registry's keys). */
export type GameId =
  | 'baccarat'
  | 'blackjack'
  | 'cases'
  | 'chickenroad'
  | 'coinflip'
  | 'crash'
  | 'diamonds'
  | 'dice'
  | 'dragon-tower'
  | 'hilo'
  | 'keno'
  | 'limbo'
  | 'mines'
  | 'plinko'
  | 'pump'
  | 'roulette'
  | 'sicbo'
  | 'slots'
  | 'threecardpoker'
  | 'videopoker'
  | 'wheel'

/**
 * Per-round inputs an outcome may legitimately depend on, fixed at commit/placement. All
 * optional — a given game reads only the fields it needs, and a resolver throws if a required
 * one is missing. None of these can be used by the player to bias the result: they pick the
 * game shape (difficulty, mine count, rows, segments) and the locked house config.
 */
export interface ResolveParams {
  /** Locked house config for distribution-model games (crash, limbo, cases). */
  config?: CrashHouseConfig | LimboHouseConfig | CasesHouseConfig
  /** Cases risk tier. */
  risk?: CasesRisk
  /** How many draws a streak game needs so far (coinflip, hilo). */
  count?: number
  /** Plinko board height. */
  rows?: number
  /** Chicken Road per-lane survival threshold. */
  survival?: number
  /** Chicken Road lane count. */
  lanes?: number
  /** Dragon Tower / Pump difficulty. */
  difficulty?: TowerDifficulty | PumpDifficulty
  /** Mines mine count. */
  mineCount?: number
  /** Mines grid size (defaults to the game's 25). */
  totalTiles?: number
  /** Wheel segment count. */
  segments?: number
}

/** A pure server-side derivation: withheld seed + round inputs → the raw fair outcome. */
export type GameResolver = (
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  params: ResolveParams,
) => unknown

/** Read a required numeric param or throw a clear error (the endpoint maps this to a 400). */
function num(params: ResolveParams, key: keyof ResolveParams): number {
  const v = params[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`resolve: numeric param "${key}" is required`)
  }
  return v
}

/** Read a required string param (risk/difficulty) or throw. The game validates the value. */
function str(params: ResolveParams, key: keyof ResolveParams): string {
  const v = params[key]
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`resolve: param "${key}" is required`)
  }
  return v
}

/**
 * The registry. Games with no per-round inputs ignore `params`; the rest read exactly what
 * their derivation needs. The game's own `fair.ts` validates the values (range, enum), so an
 * out-of-range mineCount/rows/segments throws there exactly as in normal play.
 */
export const GAME_RESOLVERS: Record<GameId, GameResolver> = {
  baccarat: (s, c, n) => dealBaccarat(s, c, n),
  blackjack: (s, c, n) => shuffleDeck(s, c, n),
  cases: (s, c, n, p) =>
    openCase(s, c, n, str(p, 'risk') as CasesRisk, p.config as CasesHouseConfig | undefined),
  chickenroad: (s, c, n, p) => crashLane(s, c, n, num(p, 'survival'), num(p, 'lanes')),
  coinflip: (s, c, n, p) => coinsUpTo(s, c, n, num(p, 'count')),
  crash: (s, c, n, p) => crashPointFromSeeds(s, c, n, p.config as CrashHouseConfig | undefined),
  diamonds: (s, c, n) => drawGems(s, c, n),
  dice: (s, c, n) => rollFromSeeds(s, c, n),
  'dragon-tower': (s, c, n, p) => deriveTower(s, c, n, str(p, 'difficulty') as TowerDifficulty),
  hilo: (s, c, n, p) => cardsUpTo(s, c, n, num(p, 'count')),
  keno: (s, c, n) => drawNumbers(s, c, n),
  limbo: (s, c, n, p) => limboFromSeeds(s, c, n, p.config as LimboHouseConfig | undefined),
  mines: (s, c, n, p) => deriveMines(s, c, n, num(p, 'mineCount'), p.totalTiles),
  plinko: (s, c, n, p) => dropBall(s, c, n, num(p, 'rows')),
  pump: (s, c, n, p) => derivePops(s, c, n, str(p, 'difficulty') as PumpDifficulty),
  roulette: (s, c, n) => spinPocket(s, c, n),
  sicbo: (s, c, n) => rollDice(s, c, n),
  slots: (s, c, n) => spin(s, c, n),
  threecardpoker: (s, c, n) => dealThreeCard(s, c, n),
  videopoker: (s, c, n) => dealVideoPoker(s, c, n),
  wheel: (s, c, n, p) => spinSegment(s, c, n, num(p, 'segments')),
}

/** Runtime guard: is `game` a registered resolver id? */
export function isGameId(game: unknown): game is GameId {
  return typeof game === 'string' && Object.prototype.hasOwnProperty.call(GAME_RESOLVERS, game)
}

/**
 * Derive a game's outcome server-side from the revealed seed. The single entry point the
 * fairness endpoint and the client's local fallback both call, so they can never drift.
 * Throws on an unknown game (the endpoint maps it to a 400).
 */
export function resolveGameOutcome(
  game: GameId,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  params: ResolveParams = {},
): unknown {
  return GAME_RESOLVERS[game](serverSeed, clientSeed, nonce, params)
}
