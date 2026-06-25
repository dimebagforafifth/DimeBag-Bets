/**
 * Pump game engine (CLAUDE.md §7) — a vertical slice's backend.
 *
 * Plugs into the shared credit/balance core: creating a game places a wager
 * (holding the stake), and the round resolves through `core` exactly once — a
 * loss when the balloon pops, a win on cash-out or a full run. This module
 * tracks NO points of its own (§3); the figure lives entirely in `core`.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account, Wager } from '../../core/index.js'
import { placeWager, resolveWager } from '../../core/index.js'
import { derivePops, hashServerSeed } from './fair.js'
import {
  DEFAULT_HOUSE_CONFIG,
  DIFFICULTIES,
  maxPumps,
  pumpMultiplier,
  type PumpDifficulty,
  type PumpHouseConfig,
} from './multiplier.js'

export type PumpStatus = 'active' | 'popped' | 'cashed' | 'maxed'

export interface PumpGame {
  wager: Wager
  difficulty: PumpDifficulty
  /** Pop cells hidden among the 25 (derived count), for convenience. */
  pops: number
  /** Pop-cell positions (0..24) — server-authoritative. */
  popPositions: number[]
  /** Successful pumps banked so far. */
  pumps: number
  /** Hard ceiling = 25 − pops (every safe cell revealed). */
  maxPumps: number
  status: PumpStatus
  /** Provably-fair commitment shown before the round. */
  serverSeedHash: string
  /** The server seed — withheld from the player until the round ends. */
  serverSeed: string
  clientSeed: string
  nonce: number
  /** House settings locked in at bet time — the vig can't move mid-round (§4). */
  config: PumpHouseConfig
  /** Set once the round resolves as a win (cash-out or full run). */
  payoutMultiplier?: number
}

export interface CreatePumpOptions {
  stake: number
  difficulty: PumpDifficulty
  clientSeed: string
  nonce: number
  /** Optional explicit server seed (otherwise a random one is generated). */
  serverSeed?: string
  /** Manager-controlled house settings; defaults to DEFAULT_HOUSE_CONFIG. */
  config?: PumpHouseConfig
}

/** A fresh random server seed (hex). Uses the platform CSPRNG via @noble. */
export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Total return multiplier the player would lock in by cashing out now. */
export function currentMultiplier(game: PumpGame): number {
  return pumpMultiplier(game.difficulty, game.pumps, game.config)
}

/** What the multiplier becomes after one more safe pump (null at the ceiling). */
export function nextMultiplier(game: PumpGame): number | null {
  if (game.pumps >= game.maxPumps) return null
  return pumpMultiplier(game.difficulty, game.pumps + 1, game.config)
}

/**
 * Start a round: validate, place the wager through `core` (holding the stake),
 * and commit the provably-fair pop layout up front.
 */
export function createPumpGame(account: Account, opts: CreatePumpOptions): PumpGame {
  const cfg = DIFFICULTIES[opts.difficulty]
  if (!cfg) throw new Error(`unknown difficulty: ${opts.difficulty}`)

  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const wager = placeWager(account, opts.stake)
  const popPositions = derivePops(serverSeed, opts.clientSeed, opts.nonce, opts.difficulty)

  return {
    wager,
    difficulty: opts.difficulty,
    pops: cfg.pops,
    popPositions,
    pumps: 0,
    maxPumps: maxPumps(opts.difficulty),
    status: 'active',
    serverSeedHash: hashServerSeed(serverSeed),
    serverSeed,
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
    config: opts.config ?? DEFAULT_HOUSE_CONFIG,
  }
}

export interface PumpResult {
  popped: boolean
  status: PumpStatus
  multiplier: number
}

/**
 * Pump once. The next cell in fixed order is revealed: a pop bursts the balloon
 * (resolves a loss); the last safe cell auto-wins at the max multiplier;
 * otherwise the multiplier rises and the round stays active.
 */
export function pump(account: Account, game: PumpGame): PumpResult {
  if (game.status !== 'active') {
    throw new Error(`cannot pump: game is ${game.status}`)
  }
  const cell = game.pumps // next cell to reveal, in fixed order

  if (game.popPositions.includes(cell)) {
    game.status = 'popped'
    resolveWager(account, game.wager, 'loss')
    return { popped: true, status: game.status, multiplier: 0 }
  }

  game.pumps += 1

  if (game.pumps === game.maxPumps) {
    // Every safe cell revealed — auto cash-out at the top multiplier.
    const multiplier = currentMultiplier(game)
    game.payoutMultiplier = multiplier
    game.status = 'maxed'
    resolveWager(account, game.wager, 'win', multiplier)
    return { popped: false, status: game.status, multiplier }
  }

  return { popped: false, status: game.status, multiplier: currentMultiplier(game) }
}

/**
 * Cash out the round as a win at the current multiplier. Requires at least one
 * safe pump (a 0-pump cash-out would be below 1× and isn't offered).
 */
export function cashOut(account: Account, game: PumpGame): number {
  if (game.status !== 'active') {
    throw new Error(`cannot cash out: game is ${game.status}`)
  }
  if (game.pumps < 1) {
    throw new Error('cannot cash out before pumping at least once')
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
  difficulty: PumpDifficulty
  popPositions: number[]
}

export function revealProof(game: PumpGame): FairProof {
  if (game.status === 'active') {
    throw new Error('server seed is only revealed after the round ends')
  }
  return {
    serverSeed: game.serverSeed,
    serverSeedHash: game.serverSeedHash,
    clientSeed: game.clientSeed,
    nonce: game.nonce,
    difficulty: game.difficulty,
    popPositions: game.popPositions,
  }
}
