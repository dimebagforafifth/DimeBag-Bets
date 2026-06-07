/**
 * Roulette engine (CLAUDE.md §7) — instant: hold the combined stake, spin, and
 * settle in one call through the shared core (§3). Holds no points of its own.
 *
 * A player can place several bets in one spin (a number, a colour, a dozen…).
 * They all ride one wager for the TOTAL stake; the spin's blended return is
 * `returned / totalStake`, settled via `resolveAtMultiplier` — so the figure
 * moves by exactly `returned − totalStake` (the net), and the win/loss/push tag
 * follows the money, the same generic path Wheel and Plinko use.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils'
import type { Account } from '../../core/index.js'
import { placeWager, resolveAtMultiplier } from '../../core/index.js'
import { hashServerSeed, spinPocket } from './fair.js'
import { payoutFor } from './table.js'

/** One bet on the table: the numbers it covers, its label, and its stake (cents). */
export interface RouletteBet {
  label: string
  numbers: number[]
  stake: number
}

export interface RouletteRound {
  pocket: number
  bets: RouletteBet[]
  totalStake: number
  /** Total points returned across all winning bets (0 if the spin missed all). */
  returned: number
  /** Signed change to the figure: returned − totalStake. */
  profit: number
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface PlayRouletteOptions {
  bets: RouletteBet[]
  clientSeed: string
  nonce: number
  serverSeed?: string
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** What a single bet returns if `pocket` hits it: stake × (36 / count), else 0. */
function betReturn(bet: RouletteBet, pocket: number): number {
  if (!bet.numbers.includes(pocket)) return 0
  return Math.round(bet.stake * payoutFor(bet.numbers.length))
}

/** Play one spin: validate the bets, hold the total, spin, settle at the blend. */
export function playRoulette(account: Account, opts: PlayRouletteOptions): RouletteRound {
  if (opts.bets.length === 0) throw new Error('place at least one bet')
  for (const b of opts.bets) {
    if (!Number.isInteger(b.stake) || b.stake <= 0) {
      throw new Error(`each bet needs a positive whole stake, got ${b.stake}`)
    }
    if (b.numbers.length < 1 || b.numbers.length > 36) {
      throw new Error(`a bet must cover 1..36 numbers, got ${b.numbers.length}`)
    }
  }

  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const totalStake = opts.bets.reduce((sum, b) => sum + b.stake, 0)

  const wager = placeWager(account, totalStake)
  const pocket = spinPocket(serverSeed, opts.clientSeed, opts.nonce)
  const returned = opts.bets.reduce((sum, b) => sum + betReturn(b, pocket), 0)
  resolveAtMultiplier(account, wager, returned / totalStake)

  return {
    pocket,
    bets: opts.bets,
    totalStake,
    returned,
    profit: returned - totalStake,
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
