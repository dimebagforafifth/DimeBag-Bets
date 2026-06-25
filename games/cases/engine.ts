/**
 * Cases engine (CLAUDE.md §3, §7) — instant: place a wager and resolve in one
 * call through the shared core. Holds no points of its own.
 *
 * The open settles at the landed tier's multiplier via `resolveAtMultiplier`:
 * a 0× blank is a full loss, anything above 1× a win.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account } from '../../core/index.js'
import { placeWager, resolveAtMultiplier } from '../../core/index.js'
import { hashServerSeed, openCase } from './fair.js'
import { DEFAULT_CASES_CONFIG, type CasesHouseConfig, type CasesRisk } from './payouts.js'

export interface CasesRound {
  risk: CasesRisk
  tierIndex: number
  multiplier: number
  /** Signed change to the figure: stake × (multiplier − 1), rounded. */
  profit: number
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface PlayCasesOptions {
  stake: number
  risk: CasesRisk
  clientSeed: string
  nonce: number
  serverSeed?: string
  config?: CasesHouseConfig
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Play one open: hold the stake, open the case, settle at the landed multiplier. */
export function playCases(account: Account, opts: PlayCasesOptions): CasesRound {
  const config = opts.config ?? DEFAULT_CASES_CONFIG
  const serverSeed = opts.serverSeed ?? randomServerSeed()

  const wager = placeWager(account, opts.stake)
  const { tierIndex, multiplier } = openCase(
    serverSeed,
    opts.clientSeed,
    opts.nonce,
    opts.risk,
    config,
  )
  resolveAtMultiplier(account, wager, multiplier)

  return {
    risk: opts.risk,
    tierIndex,
    multiplier,
    profit: Math.round(opts.stake * (multiplier - 1)),
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
