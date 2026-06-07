/**
 * HiLo game engine (CLAUDE.md §7) — a stateful cash-out game on the shared core.
 *
 * Creating a game places a wager (holds the stake). Each correct higher/lower
 * guess multiplies a running multiplier; a wrong guess resolves the round as a
 * loss; cashing out resolves it at the cumulative multiplier. Holds no points of
 * its own (§3) — all money flows through `core`.
 *
 * The multipliers are COMPUTED from the exact card probabilities at a
 * manager-configurable edge (like Keno/Dice), so the 1% house edge is provably
 * correct rather than copied from a table. "Higher" means ≥ the current rank and
 * "lower" means ≤ it — an equal rank wins either way, matching Stake.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils'
import type { Account, Wager } from '../../core/index.js'
import { placeWager, resolveAtMultiplier, resolveWager } from '../../core/index.js'
import { cardAt, DECK, hashServerSeed, RANKS, type Card } from './fair.js'

export type HiloStatus = 'active' | 'busted' | 'cashed'
/** 'hi' = next card higher-or-same; 'lo' = next card lower-or-same. */
export type HiloGuess = 'hi' | 'lo'

export interface HiloHouseConfig {
  /** House edge, e.g. 0.01 = 1%. Manager-configurable. */
  edge: number
}
export const DEFAULT_HILO_CONFIG: HiloHouseConfig = { edge: 0.01 }

export interface HiloGame {
  wager: Wager
  /** Cards revealed so far: [start, …]. The last is the current card. */
  cards: Card[]
  /** Cumulative multiplier — product of each correct guess's step. */
  multiplier: number
  status: HiloStatus
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
  config: HiloHouseConfig
  payoutMultiplier?: number
}

export interface CreateHiloOptions {
  stake: number
  clientSeed: string
  nonce: number
  serverSeed?: string
  config?: HiloHouseConfig
}

export interface GuessResult {
  card: Card
  correct: boolean
  status: HiloStatus
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** P(next card ≥ rank) over the 52-card deck (the current rank counts as a win). */
export function probHigher(rank: number): number {
  return (SUITS_PER_RANK * (RANKS - rank + 1)) / DECK
}
/** P(next card ≤ rank) over the 52-card deck. */
export function probLower(rank: number): number {
  return (SUITS_PER_RANK * rank) / DECK
}
const SUITS_PER_RANK = DECK / RANKS // 4

/**
 * The step multiplier for a guess on a given rank: (1 − edge) / P(win), clamped
 * so a (near-)certain guess never drops the running multiplier below where it is.
 */
export function stepMultiplier(rank: number, guess: HiloGuess, config = DEFAULT_HILO_CONFIG): number {
  const p = guess === 'hi' ? probHigher(rank) : probLower(rank)
  return Math.max(1, round2((1 - config.edge) / p))
}

/** The current (most recently revealed) card. */
export function currentCard(game: HiloGame): Card {
  return game.cards[game.cards.length - 1]
}

/** Create a game: hold the stake and deal the first card. */
export function createHiloGame(account: Account, opts: CreateHiloOptions): HiloGame {
  const config = opts.config ?? DEFAULT_HILO_CONFIG
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const wager = placeWager(account, opts.stake)
  const start = cardAt(serverSeed, opts.clientSeed, opts.nonce, 0)
  return {
    wager,
    cards: [start],
    multiplier: 1,
    status: 'active',
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
    config,
  }
}

/** Guess higher/lower. Correct → grow the multiplier; wrong → loss settled now. */
export function guess(account: Account, game: HiloGame, dir: HiloGuess): GuessResult {
  if (game.status !== 'active') throw new Error('round is not active')
  const curRank = currentCard(game).rank
  const next = cardAt(game.serverSeed, game.clientSeed, game.nonce, game.cards.length)
  game.cards.push(next)

  const correct = dir === 'hi' ? next.rank >= curRank : next.rank <= curRank
  if (correct) {
    game.multiplier = round2(game.multiplier * stepMultiplier(curRank, dir, game.config))
  } else {
    game.status = 'busted'
    resolveWager(account, game.wager, 'loss')
  }
  return { card: next, correct, status: game.status }
}

/** Skip the current card: deal a fresh one without risking anything. */
export function skip(game: HiloGame): Card {
  if (game.status !== 'active') throw new Error('round is not active')
  const next = cardAt(game.serverSeed, game.clientSeed, game.nonce, game.cards.length)
  game.cards.push(next)
  return next
}

/** Cash out the running multiplier (requires at least one winning guess). */
export function cashOut(account: Account, game: HiloGame): void {
  if (game.status !== 'active') throw new Error('round is not active')
  if (game.multiplier <= 1) throw new Error('nothing to cash out yet')
  resolveAtMultiplier(account, game.wager, game.multiplier)
  game.status = 'cashed'
  game.payoutMultiplier = game.multiplier
}

export interface FairProof {
  serverSeed: string
  clientSeed: string
  nonce: number
  cards: Card[]
}

/** Reveal the round's proof (server seed + dealt cards) once it has ended. */
export function revealProof(game: HiloGame): FairProof {
  return {
    serverSeed: game.serverSeed,
    clientSeed: game.clientSeed,
    nonce: game.nonce,
    cards: game.cards,
  }
}
