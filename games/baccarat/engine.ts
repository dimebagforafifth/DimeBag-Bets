/**
 * Baccarat engine (CLAUDE.md §7) — a full punto-banco table: stake any mix of the
 * five standard spots in one round and settle them together through the shared
 * core (§3). Holds no points of its own.
 *
 * Spots & payouts (industry-standard; §4 — fixed published odds, not tuned):
 *   - Player      → 1:1     (return 2×)
 *   - Banker      → 0.95:1  (return 1.95×, the standard 5% commission)
 *   - Tie         → 8:1     (return 9×)
 *   - Player Pair → 11:1    (return 12×)
 *   - Banker Pair → 11:1    (return 12×)
 * On a Tie, Player/Banker bets PUSH (stake returned); Pair bets resolve on their
 * own (the first two cards of the hand). The deal runs on a real 8-deck shoe
 * (`fair.ts`), so the realized edges match the published 8-deck figures: Banker
 * ≈ 1.06%, Player ≈ 1.24%, Tie ≈ 14.4%, each Pair ≈ 10.36%.
 *
 * Settlement mirrors Roulette: all spots fold into ONE wager for the total stake,
 * resolved at `totalReturn / totalStake`, so a round is a single ledger entry with
 * the net result — while `results` carries the per-spot breakdown for the UI.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account, Wager } from '../../core/index.js'
import { availableToWager, placeWager, resolveAtMultiplier } from '../../core/index.js'
import { dealBaccarat, hashServerSeed, type BaccaratDeal } from './fair.js'

/** The five spots a player can back. */
export type BaccaratBet = 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair'

/** Spots in display/settlement order. */
export const BET_ORDER: BaccaratBet[] = ['player', 'banker', 'tie', 'playerPair', 'bankerPair']

/** The total a winning bet on each spot returns (stake × this), standard odds. */
export const PAYOUTS: Record<BaccaratBet, number> = {
  player: 2, // 1:1
  banker: 1.95, // 0.95:1 (5% commission)
  tie: 9, // 8:1
  playerPair: 12, // 11:1
  bankerPair: 12, // 11:1
}

/** A spot's "X:1" label, for the felt. */
export const ODDS_LABEL: Record<BaccaratBet, string> = {
  player: '1:1',
  banker: '1:1', // (−5% commission)
  tie: '8:1',
  playerPair: '11:1',
  bankerPair: '11:1',
}

export type BetOutcome = 'win' | 'loss' | 'push'

/** How one spot resolves against a deal: its return multiplier (0 loss, 1 push,
 *  >1 win) and the categorical outcome. */
export function spotOutcome(bet: BaccaratBet, deal: BaccaratDeal): { outcome: BetOutcome; multiplier: number } {
  switch (bet) {
    case 'player':
      if (deal.winner === 'player') return { outcome: 'win', multiplier: PAYOUTS.player }
      if (deal.winner === 'tie') return { outcome: 'push', multiplier: 1 }
      return { outcome: 'loss', multiplier: 0 }
    case 'banker':
      if (deal.winner === 'banker') return { outcome: 'win', multiplier: PAYOUTS.banker }
      if (deal.winner === 'tie') return { outcome: 'push', multiplier: 1 }
      return { outcome: 'loss', multiplier: 0 }
    case 'tie':
      return deal.winner === 'tie'
        ? { outcome: 'win', multiplier: PAYOUTS.tie }
        : { outcome: 'loss', multiplier: 0 }
    case 'playerPair':
      return deal.playerPair
        ? { outcome: 'win', multiplier: PAYOUTS.playerPair }
        : { outcome: 'loss', multiplier: 0 }
    case 'bankerPair':
      return deal.bankerPair
        ? { outcome: 'win', multiplier: PAYOUTS.bankerPair }
        : { outcome: 'loss', multiplier: 0 }
  }
}

/** One staked spot's outcome, for display. */
export interface BetResult {
  bet: BaccaratBet
  stake: number
  outcome: BetOutcome
  /** Return multiplier for this spot (0 loss, 1 push, >1 win). */
  multiplier: number
  /** Cents returned on this spot (stake × multiplier, rounded). */
  returned: number
  /** Signed change to the figure from this spot (returned − stake). */
  profit: number
}

export interface BaccaratRound {
  deal: BaccaratDeal
  /** Per-spot breakdown for the spots that were staked. */
  results: BetResult[]
  totalStake: number
  totalReturn: number
  /** Net signed change to the figure (totalReturn − totalStake). */
  totalProfit: number
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

/** Stakes per spot, in cents (omit or 0 for spots not backed this round). */
export type Bets = Partial<Record<BaccaratBet, number>>

export interface PlayBaccaratOptions {
  bets: Bets
  clientSeed: string
  nonce: number
  serverSeed?: string
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/**
 * Play one round: validate the spots, hold the total stake as a single wager,
 * deal a fresh 8-deck shoe, settle every spot, and resolve the wager at the net
 * return multiplier.
 */
export function playBaccarat(account: Account, opts: PlayBaccaratOptions): BaccaratRound {
  const serverSeed = opts.serverSeed ?? randomServerSeed()

  const staked = BET_ORDER.filter((b) => (opts.bets[b] ?? 0) > 0)
  if (staked.length === 0) throw new Error('place at least one bet')
  for (const b of staked) {
    const s = opts.bets[b]!
    if (!Number.isInteger(s) || s <= 0) throw new Error(`each bet needs a positive whole stake, got ${s}`)
  }

  const totalStake = staked.reduce((sum, b) => sum + opts.bets[b]!, 0)
  if (totalStake > availableToWager(account)) {
    throw new Error('total stake exceeds what you can wager')
  }

  // One wager for the whole round (validated above) — like Roulette, so the round
  // is a single ledger entry carrying the net result.
  const wager: Wager = placeWager(account, totalStake)
  const deal = dealBaccarat(serverSeed, opts.clientSeed, opts.nonce)

  const results: BetResult[] = staked.map((bet) => {
    const stake = opts.bets[bet]!
    const { outcome, multiplier } = spotOutcome(bet, deal)
    const returned = Math.round(stake * multiplier)
    return { bet, stake, outcome, multiplier, returned, profit: returned - stake }
  })

  const totalReturn = results.reduce((sum, r) => sum + r.returned, 0)
  // resolveAtMultiplier rounds stake × (m − 1) → exactly totalReturn − totalStake.
  resolveAtMultiplier(account, wager, totalReturn / totalStake)

  return {
    deal,
    results,
    totalStake,
    totalReturn,
    totalProfit: totalReturn - totalStake,
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}
