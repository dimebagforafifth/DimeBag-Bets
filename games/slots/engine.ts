/**
 * Slots engine (CLAUDE.md §7) — instant: place a wager and resolve in one call
 * through the shared core (§3). Holds no points of its own.
 *
 * The spin settles at the triple's multiplier via `resolveAtMultiplier`: a 0×
 * result (no three-of-a-kind, fewer than two cherries) is a full loss, a paying
 * triple a win.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account } from '../../core/index.js'
import { placeWager, resolveAtMultiplier } from '../../core/index.js'
import { hashServerSeed, spin } from './fair.js'
import { DEFAULT_SLOTS_CONFIG, multiplierFor, type SlotsHouseConfig } from './payouts.js'

export interface SlotsRound {
  /** The three reel symbol indices, e.g. [0, 0, 0] = three cherries. */
  reels: number[]
  /** Win multiplier: three-of-a-kind, else two-cherry, else 0. */
  multiplier: number
  /** Signed change to the figure: stake × (multiplier − 1), rounded. */
  profit: number
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface PlaySlotsOptions {
  stake: number
  clientSeed: string
  nonce: number
  serverSeed?: string
  config?: SlotsHouseConfig
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Play one spin: hold the stake, spin the reels, settle at the win multiplier. */
export function playSlots(account: Account, opts: PlaySlotsOptions): SlotsRound {
  const config = opts.config ?? DEFAULT_SLOTS_CONFIG
  const serverSeed = opts.serverSeed ?? randomServerSeed()

  const wager = placeWager(account, opts.stake)
  const reels = spin(serverSeed, opts.clientSeed, opts.nonce)
  const multiplier = multiplierFor(reels, config)
  resolveAtMultiplier(account, wager, multiplier)

  return {
    reels,
    multiplier,
    profit: Math.round(opts.stake * (multiplier - 1)),
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
