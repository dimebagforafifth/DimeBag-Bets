/**
 * Plinko engine (CLAUDE.md §7) — instant: place a wager and resolve in one call
 * through the shared core (§3). Holds no points of its own.
 *
 * Every drop settles at its slot's multiplier via `resolveAtMultiplier`, so the
 * common sub-1× center slots are partial losses and 1× slots push — all on the
 * one shared figure, no game-specific money logic.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account } from '../../core/index.js'
import { placeWager, resolveAtMultiplier } from '../../core/index.js'
import { dropBall, hashServerSeed } from './fair.js'
import { payouts, computePlinkoTable, type PlinkoHouseConfig, type PlinkoRisk } from './payouts.js'

export interface PlinkoRound {
  rows: number
  risk: PlinkoRisk
  /** 0 = left, 1 = right, per peg row. */
  path: number[]
  slot: number
  multiplier: number
  /** Signed change to the figure: stake × (multiplier − 1), rounded. */
  profit: number
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface PlayPlinkoOptions {
  stake: number
  rows: number
  risk: PlinkoRisk
  clientSeed: string
  nonce: number
  serverSeed?: string
  /** Manager house edge; when set, the table is scaled to its RTP. Omit = native. */
  config?: PlinkoHouseConfig
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Play one round: hold the stake, drop the ball, settle at the slot multiplier. */
export function playPlinko(account: Account, opts: PlayPlinkoOptions): PlinkoRound {
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  // A manager edge switches to the generated edge-true table; otherwise the
  // canonical Stake table for normal play.
  const table = opts.config
    ? computePlinkoTable(opts.rows, opts.risk, opts.config)
    : payouts(opts.rows, opts.risk) // also validates rows

  const wager = placeWager(account, opts.stake)
  const { path, slot } = dropBall(serverSeed, opts.clientSeed, opts.nonce, opts.rows)
  const multiplier = table[slot]
  // TODO(server-grade): route through api/resolve-bet.ts (gradeBet 'plinko') once the
  // backend is live, so the platform derives this multiplier from the revealed seed
  // instead of trusting a client-computed one. See games/grade.ts.
  resolveAtMultiplier(account, wager, multiplier)

  return {
    rows: opts.rows,
    risk: opts.risk,
    path,
    slot,
    multiplier,
    profit: Math.round(opts.stake * (multiplier - 1)),
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
