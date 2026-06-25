/**
 * Three Card Poker engine (CLAUDE.md §7) — a stateful table game versus the
 * dealer on the shared core (§3). Holds no points of its own; every bet flows
 * through `core` as its own wager.
 *
 * createGame places the ANTE (and, if > 0, the PAIR PLUS) as core wagers and
 * deals both hands — the player's three face-up, the dealer's hidden — leaving the
 * round at status 'decide'. The player then either:
 *   - fold(): forfeits the ante (resolved at 0×); Pair Plus still settles on the
 *     player's hand; status → 'done'.
 *   - play(): places a PLAY wager equal to the ante, reveals the dealer, and
 *     settles ante + play against the dealer (with the dealer-qualifies rule and
 *     the Ante Bonus folded into the ante's return); status → 'done'.
 *
 * The whole deal is fixed by the seeds (see fair.ts), so the round is provably
 * fair: the Play/Fold choice never changes the cards — the reveal is cosmetic.
 */

import { bytesToHex, randomBytes } from '@noble/hashes/utils.js'
import type { Account, Wager } from '../../core/index.js'
import { placeWager, placeWagers, resolveAtMultiplier } from '../../core/index.js'
import { deal3, hashServerSeed, type Card, type Deal } from './fair.js'
import {
  anteBonusOdds,
  compareHands,
  dealerQualifies,
  evaluate3,
  pairPlusReturn,
  RANK_LABELS,
  type HandValue,
} from './payouts.js'

export type ThreeCardStatus = 'decide' | 'done'
export type Decision = 'play' | 'fold'

/** How a single bet in the round resolved (for the UI result lines). */
export interface BetOutcome {
  /** RETURN multiplier the bet settled at (0 = lost, 1 = push, > 1 = win). */
  multiplier: number
  /** Signed change to the figure: stake × (multiplier − 1), rounded. */
  profit: number
  /** Short human-readable line, e.g. "Ante: won 1:1 + 4:1 bonus". */
  detail: string
}

export interface ThreeCardGame {
  anteWager: Wager
  pairPlusWager?: Wager
  /** Play wager, placed only when the player chooses Play. */
  playWager?: Wager
  ante: number
  pairPlus: number
  player: Card[]
  dealer: Card[]
  playerValue: HandValue
  dealerValue: HandValue
  status: ThreeCardStatus
  decision?: Decision
  /** Set once the dealer is revealed (Play). True if Queen-high or better. */
  dealerQualified?: boolean
  /** Per-bet outcomes, set on fold/play. */
  ante_result?: BetOutcome
  play_result?: BetOutcome
  pairPlus_result?: BetOutcome
  serverSeed: string
  serverSeedHash: string
  clientSeed: string
  nonce: number
}

export interface CreateGameOptions {
  ante: number
  /** Pair Plus side-bet stake; 0 (or omitted) places no side bet. */
  pairPlus?: number
  clientSeed: string
  nonce: number
  serverSeed?: string
}

export function randomServerSeed(): string {
  return bytesToHex(randomBytes(32))
}

/**
 * Create a round: hold the ANTE (and the PAIR PLUS, if any) and deal both hands.
 * The two bets are placed as ONE all-or-nothing batch (core.placeWagers): if the
 * pair-plus stake wouldn't fit, the ante hold is rolled back too, so a round can
 * never strand the ante in `pending`.
 */
export function createGame(account: Account, opts: CreateGameOptions): ThreeCardGame {
  const serverSeed = opts.serverSeed ?? randomServerSeed()
  const pairPlus = opts.pairPlus ?? 0

  // Ante + pair plus held together (or neither): a pair-plus that doesn't fit can
  // never leave the ante stranded in pending.
  const wagers = placeWagers(account, pairPlus > 0 ? [opts.ante, pairPlus] : [opts.ante])
  const anteWager = wagers[0]
  const pairPlusWager = wagers[1] // undefined when there's no pair plus

  const deal: Deal = deal3(serverSeed, opts.clientSeed, opts.nonce)
  return {
    anteWager,
    pairPlusWager,
    ante: opts.ante,
    pairPlus,
    player: deal.player,
    dealer: deal.dealer,
    playerValue: evaluate3(deal.player),
    dealerValue: evaluate3(deal.dealer),
    status: 'decide',
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: opts.clientSeed,
    nonce: opts.nonce,
  }
}

/** Settle the Pair Plus side bet (if any) on the player's hand. Independent of
 *  Play/Fold — paid at the deal-time hand. */
function settlePairPlusBet(account: Account, game: ThreeCardGame): void {
  if (!game.pairPlusWager) return
  const m = pairPlusReturn(game.playerValue)
  resolveAtMultiplier(account, game.pairPlusWager, m)
  game.pairPlus_result = {
    multiplier: m,
    profit: Math.round(game.pairPlus * (m - 1)),
    detail:
      m > 0
        ? `${RANK_LABELS[game.playerValue.rank]} — pays ${m}×`
        : 'no pair or better — lost',
  }
}

/**
 * FOLD: the player forfeits the ante (resolved at 0×) and abandons the Play
 * option. The Pair Plus side bet still settles on the player's hand. status →
 * 'done'.
 */
export function fold(account: Account, game: ThreeCardGame): ThreeCardGame {
  if (game.status !== 'decide') throw new Error('round is not awaiting a decision')

  resolveAtMultiplier(account, game.anteWager, 0) // ante forfeited entirely
  game.ante_result = { multiplier: 0, profit: -game.ante, detail: 'folded — ante lost' }

  settlePairPlusBet(account, game)

  game.decision = 'fold'
  game.status = 'done'
  return game
}

/**
 * PLAY: place a PLAY wager equal to the ante, reveal the dealer, and settle:
 *   - Dealer does NOT qualify (worse than Queen-high): Ante wins 1:1 (2×), Play
 *     pushes (1×).
 *   - Dealer qualifies: compare hands. Player wins → Ante & Play each 2×; dealer
 *     wins → both 0×; tie → both push (1×).
 * The ANTE BONUS (Straight 1:1, Trips 4:1, Straight Flush 5:1) is ADDED to the
 * ante's base return regardless of the dealer, so the ante settles once at
 * base + bonus. The Pair Plus side bet settles independently on the player's hand.
 */
export function play(account: Account, game: ThreeCardGame): ThreeCardGame {
  if (game.status !== 'decide') throw new Error('round is not awaiting a decision')

  const playWager = placeWager(account, game.ante) // play equals the ante
  game.playWager = playWager

  const qualifies = dealerQualifies(game.dealerValue)
  game.dealerQualified = qualifies

  const bonus = anteBonusOdds(game.playerValue) // 0 if none; paid regardless of dealer
  const bonusText = bonus > 0 ? ` + ${bonus}:1 bonus` : ''

  let anteBase: number // base RETURN multiplier on the ante before bonus
  let playMult: number
  let anteText: string
  let playText: string

  if (!qualifies) {
    anteBase = 2 // ante wins 1:1
    playMult = 1 // play pushes
    anteText = `dealer didn't qualify — won 1:1${bonusText}`
    playText = 'dealer didn’t qualify — push'
  } else {
    const cmp = compareHands(game.playerValue, game.dealerValue)
    if (cmp > 0) {
      anteBase = 2
      playMult = 2
      anteText = `beat the dealer — won 1:1${bonusText}`
      playText = 'beat the dealer — won 1:1'
    } else if (cmp < 0) {
      anteBase = 0
      playMult = 0
      anteText = `lost to the dealer${bonusText}`
      playText = 'lost to the dealer'
    } else {
      anteBase = 1
      playMult = 1
      anteText = `tied the dealer — push${bonusText}`
      playText = 'tied the dealer — push'
    }
  }

  const anteMult = anteBase + bonus // bonus folds into the ante's single settlement
  resolveAtMultiplier(account, game.anteWager, anteMult)
  resolveAtMultiplier(account, playWager, playMult)

  game.ante_result = {
    multiplier: anteMult,
    profit: Math.round(game.ante * (anteMult - 1)),
    detail: anteText,
  }
  game.play_result = {
    multiplier: playMult,
    profit: Math.round(game.ante * (playMult - 1)),
    detail: playText,
  }

  settlePairPlusBet(account, game)

  game.decision = 'play'
  game.status = 'done'
  return game
}

/** Total staked across all placed wagers (ante [+ play] [+ pair plus]). */
export function totalStaked(game: ThreeCardGame): number {
  return (
    game.ante +
    (game.playWager ? game.ante : 0) +
    (game.pairPlusWager ? game.pairPlus : 0)
  )
}

/** Total returned to the player across all settled bets (stake × multiplier). */
export function totalReturned(game: ThreeCardGame): number {
  let r = 0
  if (game.ante_result) r += Math.round(game.ante * game.ante_result.multiplier)
  if (game.play_result) r += Math.round(game.ante * game.play_result.multiplier)
  if (game.pairPlus_result) r += Math.round(game.pairPlus * game.pairPlus_result.multiplier)
  return r
}

/** Net signed change to the figure for the whole round (sum of bet profits). */
export function totalProfit(game: ThreeCardGame): number {
  return (
    (game.ante_result?.profit ?? 0) +
    (game.play_result?.profit ?? 0) +
    (game.pairPlus_result?.profit ?? 0)
  )
}

export interface FairProof {
  serverSeed: string
  clientSeed: string
  nonce: number
  player: Card[]
  dealer: Card[]
}

/** Reveal the round's proof (server seed + both hands) once it has ended. */
export function revealProof(game: ThreeCardGame): FairProof {
  return {
    serverSeed: game.serverSeed,
    clientSeed: game.clientSeed,
    nonce: game.nonce,
    player: game.player,
    dealer: game.dealer,
  }
}
