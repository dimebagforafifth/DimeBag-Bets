/**
 * Dice engine (CLAUDE.md §7) — instant: place a wager and resolve in one call,
 * all through the shared core (§3). Holds no points of its own.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils'
import type { Account } from '../../core/index.js'
import { placeWager, resolveWager } from '../../core/index.js'
import {
  DEFAULT_DICE_CONFIG,
  hashServerSeed,
  isWin,
  multiplierFor,
  rollFromSeeds,
  winChance,
  type DiceDirection,
  type DiceHouseConfig,
} from './fair.js'

export interface DiceRound {
  roll: number
  target: number
  direction: DiceDirection
  won: boolean
  /** The payout multiplier the round was settled at (only meaningful on a win). */
  multiplier: number
  winChance: number
  /** Provably-fair disclosure (instant game: revealed immediately). */
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface PlayDiceOptions {
  stake: number
  target: number
  direction: DiceDirection
  clientSeed: string
  nonce: number
  serverSeed?: string
  config?: DiceHouseConfig
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Play one round: hold the stake, roll, settle win/loss through core. */
export function playDice(account: Account, opts: PlayDiceOptions): DiceRound {
  if (!(opts.target >= 0 && opts.target <= 100)) {
    throw new Error(`target must be in 0..100, got ${opts.target}`)
  }
  const config = opts.config ?? DEFAULT_DICE_CONFIG
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const chance = winChance(opts.target, opts.direction)
  const multiplier = multiplierFor(chance, config)

  const wager = placeWager(account, opts.stake)
  const roll = rollFromSeeds(serverSeed, opts.clientSeed, opts.nonce)
  const won = isWin(roll, opts.target, opts.direction)
  resolveWager(account, wager, won ? 'win' : 'loss', won ? multiplier : undefined)

  return {
    roll,
    target: opts.target,
    direction: opts.direction,
    won,
    multiplier,
    winChance: chance,
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
