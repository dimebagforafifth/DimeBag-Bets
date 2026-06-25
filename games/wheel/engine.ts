/**
 * Wheel engine (CLAUDE.md §7) — instant: place a wager and resolve in one call
 * through the shared core (§3). Holds no points of its own.
 *
 * The spin settles at its segment's multiplier via `resolveAtMultiplier`: a 0×
 * pocket is a full loss, anything above 1× a win.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account } from '../../core/index.js'
import { placeWager, resolveAtMultiplier } from '../../core/index.js'
import { hashServerSeed, spinSegment } from './fair.js'
import { buildWheel, DEFAULT_WHEEL_CONFIG, type WheelHouseConfig, type WheelRisk } from './payouts.js'

export interface WheelRound {
  risk: WheelRisk
  segments: number
  segment: number
  multiplier: number
  /** Signed change to the figure: stake × (multiplier − 1), rounded. */
  profit: number
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface PlayWheelOptions {
  stake: number
  risk: WheelRisk
  segments: number
  clientSeed: string
  nonce: number
  serverSeed?: string
  config?: WheelHouseConfig
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Play one spin: hold the stake, spin, settle at the landing multiplier. */
export function playWheel(account: Account, opts: PlayWheelOptions): WheelRound {
  const config = opts.config ?? DEFAULT_WHEEL_CONFIG
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const table = buildWheel(opts.risk, opts.segments, config) // also validates segments

  const wager = placeWager(account, opts.stake)
  const segment = spinSegment(serverSeed, opts.clientSeed, opts.nonce, opts.segments)
  const multiplier = table[segment]
  resolveAtMultiplier(account, wager, multiplier)

  return {
    risk: opts.risk,
    segments: opts.segments,
    segment,
    multiplier,
    profit: Math.round(opts.stake * (multiplier - 1)),
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
