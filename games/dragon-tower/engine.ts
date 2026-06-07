/**
 * Dragon Tower game engine (CLAUDE.md §7) — a vertical slice's backend.
 *
 * Plugs into the shared credit/balance core: creating a game places a wager
 * (holding the stake), and the round resolves through `core` exactly once — a
 * loss on hitting a skull, a win on cash-out or a full climb. This module tracks
 * NO points of its own (§3); the figure lives entirely in `core`.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils'
import type { Account, Wager } from '../../core/index.js'
import { placeWager, resolveWager } from '../../core/index.js'
import { deriveTower, hashServerSeed, isSkull } from './fair.js'
import {
  DEFAULT_HOUSE_CONFIG,
  DIFFICULTIES,
  ROWS,
  towerMultiplier,
  type TowerDifficulty,
  type TowerHouseConfig,
} from './difficulty.js'

export type TowerStatus = 'active' | 'busted' | 'cashed' | 'cleared'

export interface TowerGame {
  wager: Wager
  difficulty: TowerDifficulty
  /** Tiles per row, for convenience (derived from difficulty). */
  tiles: number
  rows: number
  /** Per-row skull positions (bottom row first) — server-authoritative. */
  layout: number[][]
  /** The tile the player picked on each cleared row, in climb order. */
  picks: number[]
  status: TowerStatus
  /** On a bust: the row and tile that ended the run. */
  bustRow?: number
  bustTile?: number
  /** Provably-fair commitment shown before the round. */
  serverSeedHash: string
  /** The server seed — withheld from the player until the round ends. */
  serverSeed: string
  clientSeed: string
  nonce: number
  /** House settings locked in at bet time — the vig can't move mid-round (§4). */
  config: TowerHouseConfig
  /** Set once the round resolves as a win (cash-out or full climb). */
  payoutMultiplier?: number
}

export interface CreateTowerOptions {
  stake: number
  difficulty: TowerDifficulty
  clientSeed: string
  nonce: number
  /** Optional explicit server seed (otherwise a random one is generated). */
  serverSeed?: string
  /** Manager-controlled house settings; defaults to DEFAULT_HOUSE_CONFIG. */
  config?: TowerHouseConfig
}

/** A fresh random server seed (hex). Uses the platform CSPRNG via @noble. */
export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** The current level: how many rows the player has cleared. */
export function level(game: TowerGame): number {
  return game.picks.length
}

/** Total return multiplier the player would lock in by cashing out now. */
export function currentMultiplier(game: TowerGame): number {
  return towerMultiplier(game.difficulty, game.picks.length, game.config)
}

/** What the multiplier becomes after clearing one more row (null at the top). */
export function nextMultiplier(game: TowerGame): number | null {
  if (game.picks.length >= game.rows) return null
  return towerMultiplier(game.difficulty, game.picks.length + 1, game.config)
}

/**
 * Start a round: validate, place the wager through `core` (holding the stake),
 * and commit the provably-fair tower up front.
 */
export function createTowerGame(account: Account, opts: CreateTowerOptions): TowerGame {
  const cfg = DIFFICULTIES[opts.difficulty]
  if (!cfg) throw new Error(`unknown difficulty: ${opts.difficulty}`)

  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const wager = placeWager(account, opts.stake)
  const layout = deriveTower(serverSeed, opts.clientSeed, opts.nonce, opts.difficulty)

  return {
    wager,
    difficulty: opts.difficulty,
    tiles: cfg.tiles,
    rows: ROWS,
    layout,
    picks: [],
    status: 'active',
    serverSeedHash: hashServerSeed(serverSeed),
    serverSeed,
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
    config: opts.config ?? DEFAULT_HOUSE_CONFIG,
  }
}

export interface PickResult {
  hitSkull: boolean
  status: TowerStatus
  multiplier: number
}

/**
 * Pick a tile on the current row. A skull busts the run (resolves a loss); an
 * egg that clears the top row auto-wins at the max multiplier; otherwise the run
 * climbs one row and stays active.
 */
export function pickTile(account: Account, game: TowerGame, tile: number): PickResult {
  if (game.status !== 'active') {
    throw new Error(`cannot pick: game is ${game.status}`)
  }
  const row = game.picks.length
  if (!Number.isInteger(tile) || tile < 0 || tile >= game.tiles) {
    throw new Error(`tile must be an integer in 0..${game.tiles - 1}, got ${tile}`)
  }

  if (isSkull(game.layout, row, tile)) {
    game.status = 'busted'
    game.bustRow = row
    game.bustTile = tile
    resolveWager(account, game.wager, 'loss')
    return { hitSkull: true, status: game.status, multiplier: 0 }
  }

  game.picks.push(tile)

  if (game.picks.length === game.rows) {
    // Reached the top — auto cash-out at the max multiplier.
    const multiplier = currentMultiplier(game)
    game.payoutMultiplier = multiplier
    game.status = 'cleared'
    resolveWager(account, game.wager, 'win', multiplier)
    return { hitSkull: false, status: game.status, multiplier }
  }

  return { hitSkull: false, status: game.status, multiplier: currentMultiplier(game) }
}

/**
 * Cash out the run as a win at the current multiplier. Requires at least one
 * cleared row (a level-0 cash-out would be below 1× and isn't offered).
 */
export function cashOut(account: Account, game: TowerGame): number {
  if (game.status !== 'active') {
    throw new Error(`cannot cash out: game is ${game.status}`)
  }
  if (game.picks.length < 1) {
    throw new Error('cannot cash out before clearing at least one row')
  }
  const multiplier = currentMultiplier(game)
  game.payoutMultiplier = multiplier
  game.status = 'cashed'
  resolveWager(account, game.wager, 'win', multiplier)
  return multiplier
}

/** Provably-fair disclosure for a finished round, for player verification. */
export interface FairProof {
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  difficulty: TowerDifficulty
  layout: number[][]
}

export function revealProof(game: TowerGame): FairProof {
  if (game.status === 'active') {
    throw new Error('server seed is only revealed after the round ends')
  }
  return {
    serverSeed: game.serverSeed,
    serverSeedHash: game.serverSeedHash,
    clientSeed: game.clientSeed,
    nonce: game.nonce,
    difficulty: game.difficulty,
    layout: game.layout,
  }
}
