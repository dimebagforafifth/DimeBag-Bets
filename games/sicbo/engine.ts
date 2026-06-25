/**
 * Sic Bo engine (CLAUDE.md §7) — instant: place every bet, roll the dice, and
 * settle each bet in one call through the shared core (§3). Holds no points of
 * its own.
 *
 * A round can carry MULTIPLE simultaneous bets (Small + a Single 5 + a Total 9,
 * say). Each is placed as its OWN core wager (placeWager) and settled
 * independently via resolveAtMultiplier — a winner at its standard RETURN
 * multiplier, a loser at 0× — so the money model stays in one place and a
 * mixed round (some win, some lose) nets out correctly (§2, §3).
 *
 * The roll is decided ONLY by the seeds (see fair.ts), so it is provably fair;
 * which bets the player backs is purely a wager choice, never an input to the dice.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account, Wager } from '../../core/index.js'
import { placeWagers, resolveAtMultiplier } from '../../core/index.js'
import { hashServerSeed, rollDice, type Dice } from './fair.js'
import { betReturn, validateBetSpec, type BetSpec, type BetType } from './payouts.js'

/** One bet the player wants to stake on the round. */
export interface SicBoBet {
  type: BetType
  /** Face 1..6 (single/double/triple/combo) or total 4..17 (total); unused otherwise. */
  param?: number
  /** The second face 1..6 of a two-dice combination (combo only). */
  param2?: number
  /** Stake in integer cents. */
  stake: number
}

/** The graded result of a single bet. */
export interface SicBoBetResult {
  type: BetType
  param?: number
  param2?: number
  stake: number
  won: boolean
  /** The RETURN multiplier the bet settled at (0 on a loss). */
  multiplier: number
  /** Signed change to the figure: stake × (multiplier − 1), rounded. */
  profit: number
}

export interface SicBoRound {
  dice: Dice
  total: number
  results: SicBoBetResult[]
  /** Sum of every bet's stake. */
  totalStake: number
  /** Sum of every bet's profit (net change to the figure this round). */
  totalProfit: number
  /** Total returned across all bets (stake + profit), for the win-popup multiplier. */
  totalReturn: number
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface PlaySicBoOptions {
  bets: SicBoBet[]
  clientSeed: string
  nonce: number
  serverSeed?: string
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/**
 * Play one roll: place every bet, roll, settle each. The whole stack of bets is
 * placed as ONE all-or-nothing batch (core.placeWagers): each is validated by
 * core (stake > 0, integer, fits availableToWager, per-head limits) and if any
 * one doesn't fit, every hold already taken is rolled back — so a round can never
 * strand part of its stake in `pending`.
 */
export function playSicBo(account: Account, opts: PlaySicBoOptions): SicBoRound {
  if (opts.bets.length === 0) throw new Error('at least one bet is required')

  // Validate EVERY spec BEFORE placing any wager. A malformed bet (bad face/total,
  // or a combo with equal faces) must reject the whole round up front — otherwise
  // the bets placed before it would already be graded while the rest stay open,
  // leaking stake in `pending` and corrupting the figure (settlement is all-or-nothing).
  for (const b of opts.bets) validateBetSpec({ type: b.type, param: b.param, param2: b.param2 })

  const serverSeed = opts.serverSeed ?? randomServerSeed()

  // Place the full stack as one atomic batch FIRST, so it's all validated / held
  // (or none held, on a roll-back) before we touch the dice — and the roll is
  // independent of this anyway.
  const wagers: Wager[] = placeWagers(account, opts.bets.map((b) => b.stake))

  const dice = rollDice(serverSeed, opts.clientSeed, opts.nonce)

  const results: SicBoBetResult[] = opts.bets.map((bet, i) => {
    const spec: BetSpec = { type: bet.type, param: bet.param, param2: bet.param2 }
    const multiplier = betReturn(spec, dice)
    resolveAtMultiplier(account, wagers[i], multiplier)
    return {
      type: bet.type,
      param: bet.param,
      param2: bet.param2,
      stake: bet.stake,
      won: multiplier > 1,
      multiplier,
      profit: Math.round(bet.stake * (multiplier - 1)),
    }
  })

  const totalStake = results.reduce((a, r) => a + r.stake, 0)
  const totalProfit = results.reduce((a, r) => a + r.profit, 0)

  return {
    dice,
    total: dice[0] + dice[1] + dice[2],
    results,
    totalStake,
    totalProfit,
    totalReturn: totalStake + totalProfit,
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
