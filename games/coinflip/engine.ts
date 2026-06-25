/**
 * Coin Flip game engine (CLAUDE.md §7) — a stateful cash-out streak game on the
 * shared core, mirroring HiLo's shape.
 *
 * Creating a game places a wager (holds the stake) and starts a streak at
 * multiplier 1. Each correct call (heads/tails) multiplies the running
 * multiplier by a fixed step; a wrong call resolves the streak as a loss; cashing
 * out resolves it at the cumulative multiplier. Holds no points of its own (§3) —
 * all money flows through `core`.
 *
 * The step multiplier is COMPUTED from the exact 50/50 coin odds at a
 * manager-configurable edge (like Keno/HiLo), so the 2% house edge is provably
 * correct rather than copied from a table: step = (1 − edge) / 0.5 = 1.96× at the
 * default (matching Stake's coin flip). Each correct call is an independent 1.96×
 * bet, RTP 0.5 × 1.96 = 0.98 — and because a streak just compounds independent
 * flips (multiplier = 1.96ⁿ), that same 2% edge holds on every flip and every coin.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account, Wager } from '../../core/index.js'
import { placeWager, resolveAtMultiplier, resolveWager } from '../../core/index.js'
import { coinAt, hashServerSeed, type CoinFace } from './fair.js'

export type CoinFlipStatus = 'active' | 'busted' | 'cashed'

/** P(a fair coin lands on a called face). The odds the multiplier is scaled to. */
export const COIN_WIN_PROB = 0.5

export interface CoinFlipHouseConfig {
  /** House edge, e.g. 0.01 = 1%. Manager-configurable. */
  edge: number
}
export const DEFAULT_COINFLIP_CONFIG: CoinFlipHouseConfig = { edge: 0.02 }

export interface CoinFlipGame {
  wager: Wager
  /** The player's calls, in order — one per resolved flip. */
  calls: CoinFace[]
  /** The coins dealt so far, in order — parallel to `calls`. */
  results: CoinFace[]
  /** Cumulative multiplier — the step raised to the number of correct calls. */
  multiplier: number
  status: CoinFlipStatus
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  config: CoinFlipHouseConfig
  payoutMultiplier?: number
}

export interface CreateCoinFlipOptions {
  stake: number
  clientSeed: string
  nonce: number
  serverSeed?: string
  config?: CoinFlipHouseConfig
}

export interface FlipResult {
  call: CoinFace
  coin: CoinFace
  correct: boolean
  status: CoinFlipStatus
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/**
 * The per-call step multiplier: (1 − edge) / P(win) = (1 − edge) / 0.5. At the
 * default 2% edge this is 1.96×, so a single call returns 0.98 in expectation.
 */
export function stepMultiplier(config = DEFAULT_COINFLIP_CONFIG): number {
  return round2((1 - config.edge) / COIN_WIN_PROB)
}

/** Realized RTP of a single call: P(win) × step (≈ 1 − edge by construction). */
export function rtpOf(config = DEFAULT_COINFLIP_CONFIG): number {
  return COIN_WIN_PROB * stepMultiplier(config)
}

/** Create a game: hold the stake and start a fresh streak at 1×. */
export function createCoinFlip(account: Account, opts: CreateCoinFlipOptions): CoinFlipGame {
  const config = opts.config ?? DEFAULT_COINFLIP_CONFIG
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const wager = placeWager(account, opts.stake)
  return {
    wager,
    calls: [],
    results: [],
    multiplier: 1,
    status: 'active',
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
    config,
  }
}

/**
 * Call the next flip. The coin at the current sequence index (= flips so far) is
 * drawn from the seed: a correct call grows the multiplier; a wrong call busts
 * the streak and the loss is settled now.
 */
export function flip(account: Account, game: CoinFlipGame, call: CoinFace): FlipResult {
  if (game.status !== 'active') throw new Error('streak is not active')
  const coin = coinAt(game.serverSeed, game.clientSeed, game.nonce, game.results.length)
  game.calls.push(call)
  game.results.push(coin)

  const correct = call === coin
  if (correct) {
    game.multiplier = round2(game.multiplier * stepMultiplier(game.config))
  } else {
    game.status = 'busted'
    resolveWager(account, game.wager, 'loss')
  }
  return { call, coin, correct, status: game.status }
}

/** Cash out the running multiplier (requires at least one correct call). */
export function cashOut(account: Account, game: CoinFlipGame): void {
  if (game.status !== 'active') throw new Error('streak is not active')
  if (game.multiplier <= 1) throw new Error('nothing to cash out yet')
  resolveAtMultiplier(account, game.wager, game.multiplier)
  game.status = 'cashed'
  game.payoutMultiplier = game.multiplier
}

export interface FairProof {
  serverSeed: string
  clientSeed: string
  nonce: number
  calls: CoinFace[]
  results: CoinFace[]
}

/** Reveal the streak's proof (server seed + calls/coins) once it has ended. */
export function revealProof(game: CoinFlipGame): FairProof {
  return {
    serverSeed: game.serverSeed,
    clientSeed: game.clientSeed,
    nonce: game.nonce,
    calls: game.calls,
    results: game.results,
  }
}
