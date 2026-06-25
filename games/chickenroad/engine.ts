/**
 * Chicken Road engine (CLAUDE.md §7) — a stateful cash-out game on the shared
 * core. Creating a game places a wager (holds the stake); each safe step raises
 * the multiplier; stepping into the crash lane resolves a loss; cashing out (or
 * crossing the whole road) resolves at the reached lane's multiplier. Holds no
 * points of its own (§3).
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account, Wager } from '../../core/index.js'
import { placeWager, resolveAtMultiplier, resolveWager } from '../../core/index.js'
import { crashLane, hashServerSeed } from './fair.js'
import {
  DEFAULT_CHICKEN_CONFIG,
  laneMultiplier,
  SPECS,
  type ChickenHouseConfig,
  type Difficulty,
} from './payouts.js'

export type ChickenStatus = 'active' | 'busted' | 'cashed' | 'cleared'

export interface ChickenGame {
  wager: Wager
  difficulty: Difficulty
  lanes: number
  /** Lanes crossed so far (0 = start kerb). The current multiplier is for this lane. */
  position: number
  /** The 1-based lane that crashes — server-authoritative, hidden until the end. */
  crashLane: number
  multiplier: number
  status: ChickenStatus
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  config: ChickenHouseConfig
  payoutMultiplier?: number
}

export interface CreateChickenOptions {
  stake: number
  difficulty: Difficulty
  clientSeed: string
  nonce: number
  serverSeed?: string
  config?: ChickenHouseConfig
}

export interface StepResult {
  hit: boolean
  position: number
  status: ChickenStatus
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Create a game: hold the stake and lock in the (hidden) crash lane. */
export function createChickenGame(account: Account, opts: CreateChickenOptions): ChickenGame {
  const config = opts.config ?? DEFAULT_CHICKEN_CONFIG
  const { survival, lanes } = SPECS[opts.difficulty]
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const wager = placeWager(account, opts.stake)
  return {
    wager,
    difficulty: opts.difficulty,
    lanes,
    position: 0,
    crashLane: crashLane(serverSeed, opts.clientSeed, opts.nonce, survival, lanes),
    multiplier: 1,
    status: 'active',
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
    config,
  }
}

/** Step into the next lane. Safe → raise the multiplier (auto-cash at the end);
 *  the crash lane → bust and settle the loss now. */
export function step(account: Account, game: ChickenGame): StepResult {
  if (game.status !== 'active') throw new Error('round is not active')
  const next = game.position + 1

  if (next === game.crashLane) {
    game.position = next
    game.status = 'busted'
    resolveWager(account, game.wager, 'loss')
    return { hit: true, position: next, status: game.status }
  }

  game.position = next
  game.multiplier = laneMultiplier(next, game.difficulty, game.config)
  if (next >= game.lanes) {
    // crossed the whole road — auto cash out at the top
    resolveAtMultiplier(account, game.wager, game.multiplier)
    game.status = 'cleared'
    game.payoutMultiplier = game.multiplier
  }
  return { hit: false, position: next, status: game.status }
}

/** Cash out at the current lane (requires at least one safe step). */
export function cashOut(account: Account, game: ChickenGame): void {
  if (game.status !== 'active') throw new Error('round is not active')
  if (game.position < 1) throw new Error('take at least one step before cashing out')
  resolveAtMultiplier(account, game.wager, game.multiplier)
  game.status = 'cashed'
  game.payoutMultiplier = game.multiplier
}

/** The multiplier the next safe step would reach (null if at the last lane). */
export function nextMultiplier(game: ChickenGame): number | null {
  if (game.position >= game.lanes) return null
  return laneMultiplier(game.position + 1, game.difficulty, game.config)
}

export interface FairProof {
  serverSeed: string
  clientSeed: string
  nonce: number
  crashLane: number
}

/** Reveal the round's proof once it has ended. */
export function revealProof(game: ChickenGame): FairProof {
  return {
    serverSeed: game.serverSeed,
    clientSeed: game.clientSeed,
    nonce: game.nonce,
    crashLane: game.crashLane,
  }
}
