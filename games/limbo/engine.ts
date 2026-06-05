/**
 * Limbo engine (CLAUDE.md §7) — instant: place a wager and resolve in one call
 * through the shared core (§3). Holds no points of its own.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils'
import type { Account } from '../../core/index.js'
import { placeWager, resolveWager } from '../../core/index.js'
import {
  DEFAULT_LIMBO_CONFIG,
  hashServerSeed,
  limboFromSeeds,
  MAX_MULTIPLIER,
  MIN_TARGET,
  winChanceFor,
  type LimboHouseConfig,
} from './fair.js'

export interface LimboRound {
  result: number
  target: number
  won: boolean
  winChance: number
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface PlayLimboOptions {
  stake: number
  target: number
  clientSeed: string
  nonce: number
  serverSeed?: string
  config?: LimboHouseConfig
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Play one round: hold the stake, draw the result, settle through core. */
export function playLimbo(account: Account, opts: PlayLimboOptions): LimboRound {
  if (!(opts.target >= MIN_TARGET && opts.target <= MAX_MULTIPLIER)) {
    throw new Error(`target must be in ${MIN_TARGET}..${MAX_MULTIPLIER}, got ${opts.target}`)
  }
  const config = opts.config ?? DEFAULT_LIMBO_CONFIG
  const serverSeed = opts.serverSeed ?? randomServerSeed()

  const wager = placeWager(account, opts.stake)
  const result = limboFromSeeds(serverSeed, opts.clientSeed, opts.nonce, config)
  const won = result >= opts.target
  resolveWager(account, wager, won ? 'win' : 'loss', won ? opts.target : undefined)

  return {
    result,
    target: opts.target,
    won,
    winChance: winChanceFor(opts.target, config),
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
