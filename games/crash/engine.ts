/**
 * Crash game engine (CLAUDE.md §7) — a vertical slice's backend.
 *
 * Same shape as Mines: creating a round places a wager through the shared core
 * (holding the stake); the round resolves through `core` exactly once — a win if
 * the player cashes out before the crash point, a loss if it crashes first. This
 * module tracks NO points of its own (§3).
 *
 * The crash point is fixed and committed (as a server-seed hash) at creation —
 * server-authoritative, never influenced by the player's timing.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils'
import type { Account, Wager } from '../../core/index.js'
import { placeWager, resolveWager } from '../../core/index.js'
import {
  DEFAULT_CRASH_CONFIG,
  crashPointFromSeeds,
  hashServerSeed,
  type CrashHouseConfig,
} from './fair.js'

export type CrashStatus = 'active' | 'busted' | 'cashed'

export interface CrashGame {
  wager: Wager
  /** Where the round crashes — fixed at creation, hidden until it ends. */
  crashPoint: number
  status: CrashStatus
  /** The multiplier the player locked in (set on a win). */
  cashOutMultiplier?: number
  /** Provably-fair commitment shown before the round. */
  serverSeedHash: string
  /** The server seed — withheld until the round ends. */
  serverSeed: string
  clientSeed: string
  nonce: number
  /** House settings locked in at bet time — the vig can't move mid-round (§4). */
  config: CrashHouseConfig
}

export interface CreateCrashOptions {
  stake: number
  clientSeed: string
  nonce: number
  /** Optional explicit server seed (otherwise a random one is generated). */
  serverSeed?: string
  /** Manager-controlled house settings; defaults to DEFAULT_CRASH_CONFIG. */
  config?: CrashHouseConfig
}

/** A fresh random server seed (hex). Uses the platform CSPRNG via @noble. */
export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/**
 * Start a round: validate, place the wager through `core` (holding the stake),
 * and commit the provably-fair crash point up front.
 */
export function createCrashGame(account: Account, opts: CreateCrashOptions): CrashGame {
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const config = opts.config ?? DEFAULT_CRASH_CONFIG
  const wager = placeWager(account, opts.stake)
  const crashPoint = crashPointFromSeeds(serverSeed, opts.clientSeed, opts.nonce, config)

  return {
    wager,
    crashPoint,
    status: 'active',
    serverSeedHash: hashServerSeed(serverSeed),
    serverSeed,
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
    config,
  }
}

/**
 * Cash out at the live multiplier. Wins only if it's strictly below the crash
 * point; resolves the win through `core` at that multiplier. The caller (UI /
 * server clock) passes the current curve value and never exceeds the crash.
 */
export function cashOut(account: Account, game: CrashGame, atMultiplier: number): number {
  if (game.status !== 'active') {
    throw new Error(`cannot cash out: round is ${game.status}`)
  }
  if (!(atMultiplier > 1)) {
    throw new Error(`cash-out multiplier must be above 1, got ${atMultiplier}`)
  }
  if (atMultiplier >= game.crashPoint) {
    throw new Error(`too late: ${atMultiplier} is at or past the crash point`)
  }
  game.status = 'cashed'
  game.cashOutMultiplier = atMultiplier
  resolveWager(account, game.wager, 'win', atMultiplier)
  return atMultiplier
}

/**
 * The round reached its crash point with no cash-out — resolve the loss. Called
 * by the UI / server clock when the curve hits `crashPoint`.
 */
export function crashRound(account: Account, game: CrashGame): void {
  if (game.status !== 'active') {
    throw new Error(`cannot crash: round is ${game.status}`)
  }
  game.status = 'busted'
  resolveWager(account, game.wager, 'loss')
}

/** Provably-fair disclosure for a finished round, for player verification. */
export interface CrashProof {
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  crashPoint: number
}

export function revealProof(game: CrashGame): CrashProof {
  if (game.status === 'active') {
    throw new Error('server seed is only revealed after the round ends')
  }
  return {
    serverSeed: game.serverSeed,
    serverSeedHash: game.serverSeedHash,
    clientSeed: game.clientSeed,
    nonce: game.nonce,
    crashPoint: game.crashPoint,
  }
}
