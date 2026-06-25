/**
 * Mines game engine (CLAUDE.md §7) — a vertical slice's backend.
 *
 * Plugs into the shared credit/balance core: creating a game places a wager
 * (holding the stake), and the round resolves through `core` exactly once —
 * a loss on hitting a mine, a win on cash-out or a full clear. This module
 * tracks NO points of its own (§3); the figure lives entirely in `core`.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account, Wager } from '../../core/index.js'
import { placeWager, resolveWager } from '../../core/index.js'
import { deriveMines, hashServerSeed } from './fair.js'
import {
  DEFAULT_HOUSE_CONFIG,
  TOTAL_TILES,
  minesMultiplier,
  safeTiles,
  type MinesHouseConfig,
} from './multiplier.js'

export type MinesStatus = 'active' | 'busted' | 'cashed' | 'cleared'

export interface MinesGame {
  wager: Wager
  mineCount: number
  totalTiles: number
  /** Tile indices holding mines — fixed at creation, server-authoritative. */
  mines: number[]
  /** Safe tiles the player has turned over, in click order. */
  revealed: number[]
  status: MinesStatus
  /** Provably-fair commitment shown before the round. */
  serverSeedHash: string
  /** The server seed — withheld from the player until the round ends. */
  serverSeed: string
  clientSeed: string
  nonce: number
  /** House settings locked in at bet time — the vig can't move mid-round (§4). */
  config: MinesHouseConfig
  /** Set once the round resolves as a win (cash-out or clear). */
  payoutMultiplier?: number
}

export interface CreateMinesOptions {
  stake: number
  mineCount: number
  clientSeed: string
  nonce: number
  /** Optional explicit server seed (otherwise a random one is generated). */
  serverSeed?: string
  totalTiles?: number
  /** Manager-controlled house settings; defaults to DEFAULT_HOUSE_CONFIG. */
  config?: MinesHouseConfig
}

/** A fresh random server seed (hex). Uses the platform CSPRNG via @noble. */
export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Total return multiplier the player would lock in by cashing out now. */
export function currentMultiplier(game: MinesGame): number {
  return minesMultiplier(game.mineCount, game.revealed.length, game.config, game.totalTiles)
}

/** What the multiplier becomes after one more safe reveal (null if board is full). */
export function nextMultiplier(game: MinesGame): number | null {
  if (game.revealed.length >= safeTiles(game.mineCount, game.totalTiles)) return null
  return minesMultiplier(game.mineCount, game.revealed.length + 1, game.config, game.totalTiles)
}

/**
 * Start a round: validate, place the wager through `core` (holding the stake),
 * and commit the provably-fair mine layout up front.
 */
export function createMinesGame(account: Account, opts: CreateMinesOptions): MinesGame {
  const totalTiles = opts.totalTiles ?? TOTAL_TILES
  if (!Number.isInteger(opts.mineCount) || opts.mineCount < 1 || opts.mineCount > totalTiles - 1) {
    throw new Error(`mineCount must be an integer in 1..${totalTiles - 1}, got ${opts.mineCount}`)
  }

  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const wager = placeWager(account, opts.stake)
  const mines = deriveMines(serverSeed, opts.clientSeed, opts.nonce, opts.mineCount, totalTiles)

  return {
    wager,
    mineCount: opts.mineCount,
    totalTiles,
    mines,
    revealed: [],
    status: 'active',
    serverSeedHash: hashServerSeed(serverSeed),
    serverSeed,
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
    config: opts.config ?? DEFAULT_HOUSE_CONFIG,
  }
}

export interface RevealResult {
  hitMine: boolean
  status: MinesStatus
  multiplier: number
}

/**
 * Turn over a tile. A mine busts the round (resolves a loss); a safe tile that
 * clears the last gem auto-wins at the max multiplier; otherwise the round
 * stays active at the new multiplier.
 */
export function revealTile(account: Account, game: MinesGame, tile: number): RevealResult {
  if (game.status !== 'active') {
    throw new Error(`cannot reveal: game is ${game.status}`)
  }
  if (!Number.isInteger(tile) || tile < 0 || tile >= game.totalTiles) {
    throw new Error(`tile must be an integer in 0..${game.totalTiles - 1}, got ${tile}`)
  }
  if (game.revealed.includes(tile)) {
    throw new Error(`tile ${tile} is already revealed`)
  }

  if (game.mines.includes(tile)) {
    game.status = 'busted'
    resolveWager(account, game.wager, 'loss')
    return { hitMine: true, status: game.status, multiplier: 0 }
  }

  game.revealed.push(tile)

  if (game.revealed.length === safeTiles(game.mineCount, game.totalTiles)) {
    // Board cleared — auto cash-out at the top multiplier.
    const multiplier = currentMultiplier(game)
    game.payoutMultiplier = multiplier
    game.status = 'cleared'
    // TODO(server-grade): route through api/resolve-bet.ts (gradeBet 'mines') once the
    // backend is live, so the platform derives this multiplier from the revealed seed
    // instead of trusting a client-computed one. See games/grade.ts.
    resolveWager(account, game.wager, 'win', multiplier)
    return { hitMine: false, status: game.status, multiplier }
  }

  return { hitMine: false, status: game.status, multiplier: currentMultiplier(game) }
}

/**
 * Cash out the round as a win at the current multiplier. Requires at least one
 * safe reveal (a 0-gem cash-out would be below 1× and isn't offered).
 */
export function cashOut(account: Account, game: MinesGame): number {
  if (game.status !== 'active') {
    throw new Error(`cannot cash out: game is ${game.status}`)
  }
  if (game.revealed.length < 1) {
    throw new Error('cannot cash out before revealing at least one tile')
  }
  const multiplier = currentMultiplier(game)
  game.payoutMultiplier = multiplier
  game.status = 'cashed'
  // TODO(server-grade): route through api/resolve-bet.ts (gradeBet 'mines') once the
  // backend is live, so the platform derives this multiplier from the revealed seed
  // instead of trusting a client-computed one. See games/grade.ts.
  resolveWager(account, game.wager, 'win', multiplier)
  return multiplier
}

/** Provably-fair disclosure for a finished round, for player verification. */
export interface FairProof {
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  mineCount: number
  mines: number[]
}

export function revealProof(game: MinesGame): FairProof {
  if (game.status === 'active') {
    throw new Error('server seed is only revealed after the round ends')
  }
  return {
    serverSeed: game.serverSeed,
    serverSeedHash: game.serverSeedHash,
    clientSeed: game.clientSeed,
    nonce: game.nonce,
    mineCount: game.mineCount,
    mines: game.mines,
  }
}
