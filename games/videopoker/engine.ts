/**
 * Video Poker engine (CLAUDE.md §7) — a stateful deal/hold/draw round on the
 * shared core (§3). Holds no points of its own.
 *
 * createVideoPoker places the wager and deals the first 5 cards (status 'dealt').
 * draw replaces every non-held card with the next deck card (positions 5, 6, …),
 * evaluates the final 5-card hand, and settles via resolveAtMultiplier — so a
 * losing hand (0×) is a full loss, jacks-or-better (2×) is even money, and a
 * royal flush (251×) is the jackpot. status → 'done'.
 *
 * The entire deck is fixed by the seeds (see fair.ts), so the round is provably
 * fair: HOLD choices only pick which predetermined draws you take.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils'
import type { Account, Wager } from '../../core/index.js'
import { placeWager, resolveAtMultiplier } from '../../core/index.js'
import { dealtDeck, hashServerSeed, type Card } from './fair.js'
import { evaluateHand, type HandResult } from './payouts.js'

export type VideoPokerStatus = 'dealt' | 'done'

export interface VideoPokerGame {
  wager: Wager
  /** The full predetermined shuffled deck (52 cards). */
  deck: Card[]
  /** The current 5-card hand (the deal, then the post-draw hand). */
  hand: Card[]
  status: VideoPokerStatus
  /** Set on draw: the final hand's category + RETURN multiplier. */
  result?: HandResult
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface CreateVideoPokerOptions {
  stake: number
  clientSeed: string
  nonce: number
  serverSeed?: string
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/** Create a round: hold the stake and deal the first 5 cards (deck positions 0..4). */
export function createVideoPoker(account: Account, opts: CreateVideoPokerOptions): VideoPokerGame {
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const wager = placeWager(account, opts.stake)
  const deck = dealtDeck(serverSeed, opts.clientSeed, opts.nonce)
  return {
    wager,
    deck,
    hand: deck.slice(0, 5),
    status: 'dealt',
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}

/**
 * Draw: replace each non-held card with the next deck card (positions 5, 6, 7, …
 * in order), evaluate the final hand, and settle at its RETURN multiplier. The
 * holdMask is a boolean[5] aligned to the current hand — true keeps that card.
 */
export function draw(account: Account, game: VideoPokerGame, holdMask: boolean[]): HandResult {
  if (game.status !== 'dealt') throw new Error('round is not awaiting a draw')
  if (holdMask.length !== 5) throw new Error(`holdMask must have 5 entries, got ${holdMask.length}`)

  let nextPos = 5 // replacements come from deck positions 5..
  const finalHand = game.hand.map((card, i) => (holdMask[i] ? card : game.deck[nextPos++]))

  const result = evaluateHand(finalHand)
  game.hand = finalHand
  game.result = result
  game.status = 'done'
  resolveAtMultiplier(account, game.wager, result.multiplier)
  return result
}

export interface FairProof {
  serverSeed: string
  clientSeed: string
  nonce: number
  deck: Card[]
}

/** Reveal the round's proof (server seed + full deck) once it has ended. */
export function revealProof(game: VideoPokerGame): FairProof {
  return {
    serverSeed: game.serverSeed,
    clientSeed: game.clientSeed,
    nonce: game.nonce,
    deck: game.deck,
  }
}
