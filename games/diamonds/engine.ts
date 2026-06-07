/**
 * Diamonds engine (CLAUDE.md §7) — instant: place a wager and resolve in one
 * call through the shared core (§3). Holds no points of its own.
 *
 * The deal settles at its pattern's multiplier via `resolveAtMultiplier`: a
 * non-paying hand (0×) is a full loss, anything above 1× a win.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils'
import type { Account } from '../../core/index.js'
import { placeWager, resolveAtMultiplier } from '../../core/index.js'
import { drawGems, hashServerSeed } from './fair.js'
import {
  buildPaytable,
  classify,
  DEFAULT_DIAMONDS_CONFIG,
  type DiamondsHouseConfig,
  type Pattern,
} from './payouts.js'

export interface DiamondsRound {
  /** The 5 dealt gem colour indices (0..7), in order. */
  gems: number[]
  pattern: Pattern
  multiplier: number
  /** Signed change to the figure: stake × (multiplier − 1), rounded. */
  profit: number
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface PlayDiamondsOptions {
  stake: number
  clientSeed: string
  nonce: number
  serverSeed?: string
  config?: DiamondsHouseConfig
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Play one round: hold the stake, deal the gems, settle at the pattern's mult. */
export function playDiamonds(account: Account, opts: PlayDiamondsOptions): DiamondsRound {
  const config = opts.config ?? DEFAULT_DIAMONDS_CONFIG
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const table = buildPaytable(config)

  const wager = placeWager(account, opts.stake)
  const gems = drawGems(serverSeed, opts.clientSeed, opts.nonce)
  const pattern = classify(gems)
  const multiplier = table[pattern]
  resolveAtMultiplier(account, wager, multiplier)

  return {
    gems,
    pattern,
    multiplier,
    profit: Math.round(opts.stake * (multiplier - 1)),
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
