/**
 * Keno engine (CLAUDE.md §7) — instant: place a wager and resolve in one call
 * through the shared core (§3). Holds no points of its own.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account } from '../../core/index.js'
import { placeWager, resolveWager } from '../../core/index.js'
import { drawNumbers, GRID_SIZE, hashServerSeed, MAX_PICKS } from './fair.js'
import { buildPaytable, DEFAULT_KENO_CONFIG, type KenoHouseConfig, type KenoRisk } from './paytable.js'

export interface KenoRound {
  picks: number[]
  drawn: number[]
  hits: number
  multiplier: number
  won: boolean
  risk: KenoRisk
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface PlayKenoOptions {
  stake: number
  picks: number[]
  risk: KenoRisk
  clientSeed: string
  nonce: number
  serverSeed?: string
  config?: KenoHouseConfig
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Play one round: validate picks, hold the stake, draw, settle through core. */
export function playKeno(account: Account, opts: PlayKenoOptions): KenoRound {
  const picks = [...new Set(opts.picks)]
  if (picks.length !== opts.picks.length) throw new Error('picks must be unique')
  if (picks.length < 1 || picks.length > MAX_PICKS) {
    throw new Error(`pick 1..${MAX_PICKS} numbers, got ${picks.length}`)
  }
  if (picks.some((n) => !Number.isInteger(n) || n < 1 || n > GRID_SIZE)) {
    throw new Error(`picks must be integers in 1..${GRID_SIZE}`)
  }

  const config = opts.config ?? DEFAULT_KENO_CONFIG
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const table = buildPaytable(picks.length, opts.risk, config)

  const wager = placeWager(account, opts.stake)
  const drawn = drawNumbers(serverSeed, opts.clientSeed, opts.nonce)
  const drawnSet = new Set(drawn)
  const hits = picks.filter((n) => drawnSet.has(n)).length
  const multiplier = table[hits]
  const won = multiplier > 1
  // TODO(server-grade): route through api/resolve-bet.ts (gradeBet 'keno') once the
  // backend is live, so the platform derives this multiplier from the revealed seed
  // instead of trusting a client-computed one. See games/grade.ts.
  resolveWager(account, wager, won ? 'win' : 'loss', won ? multiplier : undefined)

  return {
    picks: [...picks].sort((a, b) => a - b),
    drawn,
    hits,
    multiplier,
    won,
    risk: opts.risk,
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
