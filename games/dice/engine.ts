/**
 * Dice engine (CLAUDE.md §7) — instant: place a wager and resolve in one call,
 * all through the shared core (§3). Holds no points of its own.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils'
import type { Account } from '../../core/index.js'
import { placeWager, resolveWager } from '../../core/index.js'
import {
  DEFAULT_DICE_CONFIG,
  gradeRoll,
  hashServerSeed,
  multiplierFor,
  rollFromSeeds,
  winChance,
  type DiceDirection,
  type DiceHouseConfig,
  type DiceOutcome,
} from './fair.js'

export interface DiceRound {
  roll: number
  target: number
  direction: DiceDirection
  /** The stake the round was actually played at (so display can't drift from the
   *  bet input being edited afterward). */
  stake: number
  /** How the round settled: win pays, push returns the stake, loss takes it. */
  outcome: DiceOutcome
  /** Convenience alias for `outcome === 'win'` (a push is not a win). */
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
  if (multiplier <= 1) {
    // A win must pay back more than the stake. At a high house edge a near-certain
    // target prices at or below 1× — an unwinnable bet. Refuse it BEFORE holding
    // any stake (no pending leak); the player lowers their win chance to fix it.
    throw new Error('this bet offers no profit — lower your win chance')
  }

  const wager = placeWager(account, opts.stake)
  const roll = rollFromSeeds(serverSeed, opts.clientSeed, opts.nonce)
  const outcome = gradeRoll(roll, opts.target, opts.direction)
  const won = outcome === 'win'
  // A push releases the hold and returns the stake (no multiplier); core ignores
  // the payout multiplier for non-win outcomes.
  resolveWager(account, wager, outcome, won ? multiplier : undefined)

  return {
    roll,
    target: opts.target,
    direction: opts.direction,
    stake: opts.stake,
    outcome,
    won,
    multiplier,
    winChance: chance,
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
