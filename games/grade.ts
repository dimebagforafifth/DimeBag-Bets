/**
 * Server-authoritative bet grading (CLAUDE.md §3, §6).
 *
 * The missing half of provable fairness on the MONEY path: today a game settles by the
 * client telling the server the payout multiplier (`resolveWager(..., 'win', m)`). A
 * tampered client could declare its own win. This module derives the outcome AND the
 * payout multiplier on the server, from the revealed server seed + the player's
 * clientSeed/nonce, using each game's EXISTING pure math (the per-game fair.ts) — so the
 * platform grades the bet, not the browser.
 *
 * Pure + isomorphic (only the games' fair math, which is `@noble/hashes`): the same
 * function runs in the Vercel function and a Supabase edge function. It returns the
 * authoritative `{ outcome, multiplier }`; the caller settles it through the
 * service-role `service_resolve_wager` RPC (migration 0007), never trusting a client
 * number. `core` and the per-game fair math are unchanged.
 *
 * Coverage: all 21 games — dice, limbo, crash, plinko, keno, wheel, slots, cases,
 * coinflip, diamonds, roulette, sicbo, mines, pump, chickenroad, hilo, dragon-tower,
 * baccarat, videopoker, threecardpoker, blackjack.
 */

import type { Outcome } from '../core/index.js'

// ── dice ──────────────────────────────────────────────────────────────────────
import {
  DEFAULT_DICE_CONFIG,
  gradeRoll,
  multiplierFor,
  rollFromSeeds,
  winChance,
  type DiceDirection,
} from './dice/fair.js'

// ── limbo ──────────────────────────────────────────────────────────────────────
import {
  DEFAULT_LIMBO_CONFIG,
  limboFromSeeds,
  MIN_TARGET as LIMBO_MIN_TARGET,
  type LimboHouseConfig,
} from './limbo/fair.js'

// ── crash ──────────────────────────────────────────────────────────────────────
import { crashPointFromSeeds, type CrashHouseConfig } from './crash/fair.js'

// ── plinko ────────────────────────────────────────────────────────────────────
import { dropBall } from './plinko/fair.js'
import {
  computePlinkoTable,
  type PlinkoRisk,
  type PlinkoHouseConfig,
} from './plinko/payouts.js'

// ── keno ──────────────────────────────────────────────────────────────────────
import { drawNumbers, GRID_SIZE as KENO_GRID_SIZE } from './keno/fair.js'
import {
  buildPaytable as buildKenoPaytable,
  type KenoRisk,
  type KenoHouseConfig,
} from './keno/paytable.js'

// ── wheel ─────────────────────────────────────────────────────────────────────
import { spinSegment } from './wheel/fair.js'
import { buildWheel, type WheelRisk, type WheelHouseConfig } from './wheel/payouts.js'

// ── slots ─────────────────────────────────────────────────────────────────────
import { spin as spinReels } from './slots/fair.js'
import { multiplierFor as slotsMultiplierFor, type SlotsHouseConfig } from './slots/payouts.js'

// ── cases ─────────────────────────────────────────────────────────────────────
import { openCase } from './cases/fair.js'
import { type CasesRisk, type CasesHouseConfig } from './cases/payouts.js'

// ── coinflip ──────────────────────────────────────────────────────────────────
import { coinAt, type CoinFace } from './coinflip/fair.js'

// ── diamonds ──────────────────────────────────────────────────────────────────
import { drawGems } from './diamonds/fair.js'
import {
  buildPaytable as buildDiamondsPaytable,
  classify,
  PATTERNS,
  type DiamondsHouseConfig,
} from './diamonds/payouts.js'

// ── roulette ──────────────────────────────────────────────────────────────────
import { spinPocket } from './roulette/fair.js'
import { spotFor, payoutFor } from './roulette/table.js'

// ── sic bo ────────────────────────────────────────────────────────────────────
import { rollDice } from './sicbo/fair.js'
import {
  betReturn,
  validateBetSpec,
  sumDice,
  type BetSpec,
} from './sicbo/payouts.js'

// ── mines ─────────────────────────────────────────────────────────────────────
import { deriveMines } from './mines/fair.js'
import { minesMultiplier, TOTAL_TILES as MINES_TOTAL_TILES, type MinesHouseConfig } from './mines/multiplier.js'

// ── pump ──────────────────────────────────────────────────────────────────────
import { derivePops } from './pump/fair.js'
import {
  pumpMultiplier,
  type PumpDifficulty,
  type PumpHouseConfig,
} from './pump/multiplier.js'

// ── chicken road ──────────────────────────────────────────────────────────────
import { crashLane as deriveChickenCrashLane } from './chickenroad/fair.js'
import {
  laneMultiplier,
  SPECS as CHICKEN_SPECS,
  type Difficulty as ChickenDifficulty,
  type ChickenHouseConfig,
} from './chickenroad/payouts.js'

// ── hilo ──────────────────────────────────────────────────────────────────────
import { cardsUpTo as hiloCardsUpTo } from './hilo/fair.js'

// ── dragon tower ──────────────────────────────────────────────────────────────
import { deriveTower, isSkull } from './dragon-tower/fair.js'
import {
  towerMultiplier,
  type TowerDifficulty,
  type TowerHouseConfig,
} from './dragon-tower/difficulty.js'

// ── baccarat ──────────────────────────────────────────────────────────────────
import { dealBaccarat, type BaccaratWinner } from './baccarat/fair.js'

// ── video poker ───────────────────────────────────────────────────────────────
import { dealtDeck as vpDealtDeck } from './videopoker/fair.js'
import { evaluateHand as vpEvaluateHand, type HandRank as VPHandRank } from './videopoker/payouts.js'

// ── three card poker ──────────────────────────────────────────────────────────
import { deal3 as tcpDeal } from './threecardpoker/fair.js'
import {
  evaluate3 as tcpEval,
  pairPlusReturn,
  compareHands as tcpCompare,
  dealerQualifies as tcpDealerQualifies,
  anteBonusOdds,
} from './threecardpoker/payouts.js'

// ── blackjack ─────────────────────────────────────────────────────────────────
import { shuffleDeck as bjShuffle } from './blackjack/fair.js'
import {
  handValue as bjHandValue,
  isBlackjack as bjIsBlackjack,
  isBust as bjIsBust,
} from './blackjack/cards.js'

// ─────────────────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100

/** The committed round inputs every grade needs — the seed (revealed by the authority)
 *  plus the player-supplied clientSeed/nonce that were fixed at placement. */
interface RoundSeeds {
  serverSeed: string
  clientSeed: string
  nonce: number
}

/** HiLo guess direction (re-declared locally to avoid importing engine.ts). */
export type HiloGuess = 'hi' | 'lo'
/** HiLo house config (re-declared locally). */
export interface HiloHouseConfig {
  edge: number
}
const DEFAULT_HILO_EDGE = 0.01
const HILO_RANKS = 13
const HILO_DECK = HILO_RANKS * 4 // 52

/** Baccarat bet spots. */
export type BaccaratBet = 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair'
/** Standard baccarat return multipliers per spot. */
const BACCARAT_PAYOUTS: Record<BaccaratBet, number> = {
  player: 2,    // 1:1
  banker: 1.95, // 0.95:1 (5% commission)
  tie: 9,       // 8:1
  playerPair: 12,
  bankerPair: 12,
}

/** Video poker hand ranks in best-to-worst order (for the `draw` index). */
const VP_RANKS: VPHandRank[] = [
  'royal-flush', 'straight-flush', 'four-of-a-kind', 'full-house',
  'flush', 'straight', 'three-of-a-kind', 'two-pair', 'jacks-or-better', 'nothing',
]

/** A grade request: the round seeds + the game and its bet parameters. Discriminated by
 *  `game` so each variant carries exactly the inputs its math needs. */
export type GradeRequest =
  | (RoundSeeds & {
      game: 'dice'
      target: number
      direction: DiceDirection
      edge?: number
    })
  | (RoundSeeds & {
      game: 'limbo'
      target: number
      config?: LimboHouseConfig
    })
  | (RoundSeeds & {
      game: 'crash'
      /** The multiplier the player set as their auto-cashout. Win if crash point ≥ cashout. */
      cashout: number
      config?: CrashHouseConfig
    })
  | (RoundSeeds & {
      game: 'plinko'
      rows: number
      risk: PlinkoRisk
      config?: PlinkoHouseConfig
    })
  | (RoundSeeds & {
      game: 'keno'
      /** The numbers the player picked (1..40, length 1..10). */
      picks: number[]
      risk: KenoRisk
      config?: KenoHouseConfig
    })
  | (RoundSeeds & {
      game: 'wheel'
      segments: number
      risk: WheelRisk
      config?: WheelHouseConfig
    })
  | (RoundSeeds & {
      game: 'slots'
      config?: SlotsHouseConfig
    })
  | (RoundSeeds & {
      game: 'cases'
      risk: CasesRisk
      config?: CasesHouseConfig
    })
  | (RoundSeeds & {
      game: 'coinflip'
      call: CoinFace
    })
  | (RoundSeeds & {
      game: 'diamonds'
      config?: DiamondsHouseConfig
    })
  | (RoundSeeds & {
      game: 'roulette'
      /** A BetSpot id — a number pocket (`n7`) or an outside-bet key (`red`, `dozen1`, …). */
      betId: string
    })
  | (RoundSeeds & {
      game: 'sicbo'
      /** One Sic Bo bet. Multi-bet rounds send one GradeRequest per bet. */
      bet: BetSpec
    })
  | (RoundSeeds & {
      game: 'mines'
      mineCount: number
      /** Tile indices the player opened, in order. The last entry may be a mine (loss);
       *  all safe means the player cashed out. */
      reveals: number[]
      config?: MinesHouseConfig
    })
  | (RoundSeeds & {
      game: 'pump'
      difficulty: PumpDifficulty
      /** Total cells pumped (0,1,2,…). If any cell in range is a pop → loss. */
      pumps: number
      config?: PumpHouseConfig
    })
  | (RoundSeeds & {
      game: 'chickenroad'
      difficulty: ChickenDifficulty
      /** Lanes successfully crossed before cashing out (0 = cashed out before any lane). */
      cashoutLane: number
      config?: ChickenHouseConfig
    })
  | (RoundSeeds & {
      game: 'hilo'
      /** Sequence of hi/lo guesses the player made (before busting or cashing out). */
      guesses: HiloGuess[]
      config?: HiloHouseConfig
    })
  | (RoundSeeds & {
      game: 'dragon-tower'
      difficulty: TowerDifficulty
      /** Tile index (0..tiles-1) picked on each row, bottom-row first. The last pick
       *  may be a skull (loss); all safe means the player cashed out. */
      picks: number[]
      config?: TowerHouseConfig
    })
  | (RoundSeeds & {
      game: 'baccarat'
      /** The single bet spot to grade. Multi-spot rounds send one GradeRequest per spot. */
      bet: BaccaratBet
    })
  | (RoundSeeds & {
      game: 'videopoker'
      /** Which of the initial 5 cards the player held (index 0..4). Non-held cards are
       *  replaced by deck positions 5, 6, 7, … in order. */
      holds: boolean[]
    })
  | (RoundSeeds & {
      game: 'threecardpoker'
      /** Which wager to grade. Multi-bet rounds (ante + play + pairplus) send one request
       *  per bet. The ante and play bets require `decision`. */
      bet: 'pairplus' | 'ante' | 'play'
      /** Required for 'ante' and 'play' bets: whether the player folded or played. */
      decision?: 'fold' | 'play'
    })
  | (RoundSeeds & {
      game: 'blackjack'
      /** Player actions on the single active hand. 'double' draws one card and ends the
       *  hand; the multiplier applies to the original wager AND the double wager (both
       *  settle at the same rate). Splits are not covered by this grader — each split
       *  hand needs its own wager and its own GradeRequest. */
      actions: ('hit' | 'stand' | 'double')[]
    })

/** The authoritative result the money layer settles on. */
export interface GradeResult {
  /** win pays at `multiplier`, push returns the stake, loss takes it. */
  outcome: Extract<Outcome, 'win' | 'loss' | 'push'>
  /** The payout multiplier for `service_resolve_wager` — > 1 on a win, 1 on a push,
   *  0 on a loss (the loss path ignores it). */
  multiplier: number
  /** The provably-fair draw (primary scalar): the roll for dice, crash point for crash,
   *  landing slot for plinko, match count for keno, winning pocket for roulette, dice
   *  total for sic-bo, cards seen for hilo, rows cleared for dragon-tower, etc. */
  draw: number
  /** For games whose draw is a sequence: keno drawn numbers, slots reels, sic-bo dice,
   *  mine/pop positions, hilo card ranks, dragon-tower skull positions flattened,
   *  video poker final hand. Settlement only needs `outcome`+`multiplier`; this is for
   *  the verification panel. */
  draws?: number[]
}

/**
 * Grade a round from its revealed seed — the SERVER's view of the outcome. Reuses the
 * exact published fair math, so a player re-running the `verify*` helper on the disclosed
 * seed gets the identical result. Throws on an unsupported game or invalid parameters
 * (the same guards the engines apply), so a malformed request can never settle.
 */
export function gradeBet(req: GradeRequest): GradeResult {
  switch (req.game) {
    // ── dice ────────────────────────────────────────────────────────────────
    case 'dice': {
      if (!(req.target >= 0 && req.target <= 100)) {
        throw new Error(`dice target must be in 0..100, got ${req.target}`)
      }
      const config = { edge: req.edge ?? DEFAULT_DICE_CONFIG.edge }
      const roll = rollFromSeeds(req.serverSeed, req.clientSeed, req.nonce)
      const outcome = gradeRoll(roll, req.target, req.direction)
      const mult = multiplierFor(winChance(req.target, req.direction), config)
      if (mult <= 1) {
        throw new Error('this bet offers no profit — lower the win chance')
      }
      return {
        outcome,
        multiplier: outcome === 'win' ? mult : outcome === 'push' ? 1 : 0,
        draw: roll,
      }
    }

    // ── limbo ────────────────────────────────────────────────────────────────
    case 'limbo': {
      if (!(req.target >= LIMBO_MIN_TARGET)) {
        throw new Error(`limbo target must be ≥ ${LIMBO_MIN_TARGET}, got ${req.target}`)
      }
      const config = req.config ?? DEFAULT_LIMBO_CONFIG
      const point = limboFromSeeds(req.serverSeed, req.clientSeed, req.nonce, config)
      const won = point >= req.target
      return { outcome: won ? 'win' : 'loss', multiplier: won ? req.target : 0, draw: point }
    }

    // ── crash ────────────────────────────────────────────────────────────────
    case 'crash': {
      if (!(req.cashout >= 1)) {
        throw new Error(`crash cashout must be ≥ 1, got ${req.cashout}`)
      }
      const crashPoint = crashPointFromSeeds(req.serverSeed, req.clientSeed, req.nonce, req.config)
      const won = crashPoint >= req.cashout
      return {
        outcome: won ? 'win' : 'loss',
        multiplier: won ? req.cashout : 0,
        draw: crashPoint,
      }
    }

    // ── plinko ───────────────────────────────────────────────────────────────
    case 'plinko': {
      const { slot } = dropBall(req.serverSeed, req.clientSeed, req.nonce, req.rows)
      const table = computePlinkoTable(req.rows, req.risk, req.config)
      const mult = table[slot]
      const outcome = mult > 1 ? 'win' : mult === 1 ? 'push' : 'loss'
      return { outcome, multiplier: mult, draw: slot }
    }

    // ── keno ─────────────────────────────────────────────────────────────────
    case 'keno': {
      if (req.picks.length < 1 || req.picks.length > 10) {
        throw new Error(`keno picks must be 1..10, got ${req.picks.length}`)
      }
      // The server must enforce the same invariants the client board does (engine.ts):
      // picks are DISTINCT integers in 1..GRID. A repeated pick would otherwise be
      // counted once per occurrence and inflate the match count (and the payout); an
      // out-of-range pick can never match but must still be rejected, not silently
      // ignored — the platform grades the bet, it does not trust the request.
      const seenPicks = new Set<number>()
      for (const p of req.picks) {
        if (!Number.isInteger(p) || p < 1 || p > KENO_GRID_SIZE) {
          throw new Error(`keno pick must be an integer in 1..${KENO_GRID_SIZE}, got ${p}`)
        }
        if (seenPicks.has(p)) throw new Error(`keno picks must be distinct, repeated ${p}`)
        seenPicks.add(p)
      }
      const drawn = drawNumbers(req.serverSeed, req.clientSeed, req.nonce)
      const drawnSet = new Set(drawn)
      const matches = req.picks.filter((p) => drawnSet.has(p)).length
      const table = buildKenoPaytable(req.picks.length, req.risk, req.config)
      const mult = table[matches] ?? 0
      return { outcome: mult > 0 ? 'win' : 'loss', multiplier: mult, draw: matches, draws: drawn }
    }

    // ── wheel ─────────────────────────────────────────────────────────────────
    case 'wheel': {
      const seg = spinSegment(req.serverSeed, req.clientSeed, req.nonce, req.segments)
      const table = buildWheel(req.risk, req.segments, req.config)
      const mult = table[seg]
      const outcome = mult > 1 ? 'win' : mult === 1 ? 'push' : 'loss'
      return { outcome, multiplier: mult, draw: seg }
    }

    // ── slots ─────────────────────────────────────────────────────────────────
    case 'slots': {
      const reels = spinReels(req.serverSeed, req.clientSeed, req.nonce)
      const mult = slotsMultiplierFor(reels, req.config)
      return { outcome: mult > 0 ? 'win' : 'loss', multiplier: mult, draw: reels[0], draws: reels }
    }

    // ── cases ─────────────────────────────────────────────────────────────────
    case 'cases': {
      const { tierIndex, multiplier: mult } = openCase(
        req.serverSeed, req.clientSeed, req.nonce, req.risk, req.config,
      )
      const outcome = mult > 1 ? 'win' : mult === 1 ? 'push' : 'loss'
      return { outcome, multiplier: mult, draw: tierIndex }
    }

    // ── coinflip ─────────────────────────────────────────────────────────────
    case 'coinflip': {
      const face = coinAt(req.serverSeed, req.clientSeed, req.nonce, 0)
      const won = face === req.call
      // Coin flip is a fair 2× game at the fair.ts level; house edge is applied
      // by the engine/wager layer before this grader is called.
      return {
        outcome: won ? 'win' : 'loss',
        multiplier: won ? 2 : 0,
        draw: face === 'heads' ? 0 : 1,
      }
    }

    // ── diamonds ─────────────────────────────────────────────────────────────
    case 'diamonds': {
      const gems = drawGems(req.serverSeed, req.clientSeed, req.nonce)
      const pattern = classify(gems)
      const table = buildDiamondsPaytable(req.config)
      const mult = table[pattern]
      return {
        outcome: mult > 0 ? 'win' : 'loss',
        multiplier: mult,
        draw: PATTERNS.indexOf(pattern),
        draws: gems,
      }
    }

    // ── roulette ─────────────────────────────────────────────────────────────
    case 'roulette': {
      const pocket = spinPocket(req.serverSeed, req.clientSeed, req.nonce)
      const spot = spotFor(req.betId)
      const won = spot.numbers.includes(pocket)
      return {
        outcome: won ? 'win' : 'loss',
        multiplier: won ? payoutFor(spot.numbers.length) : 0,
        draw: pocket,
      }
    }

    // ── sic bo ───────────────────────────────────────────────────────────────
    case 'sicbo': {
      validateBetSpec(req.bet)
      const dice = rollDice(req.serverSeed, req.clientSeed, req.nonce)
      const ret = betReturn(req.bet, dice)
      return {
        outcome: ret > 0 ? 'win' : 'loss',
        multiplier: ret,
        draw: sumDice(dice),
        draws: [...dice],
      }
    }

    // ── mines ─────────────────────────────────────────────────────────────────
    case 'mines': {
      const mines = deriveMines(req.serverSeed, req.clientSeed, req.nonce, req.mineCount)
      // The server must enforce the same invariants the client board does (engine.ts):
      // each reveal is a DISTINCT tile inside the board. A repeated safe tile would
      // otherwise inflate the safe-reveal count (and so the cash-out multiplier); an
      // out-of-range index can never be a mine and would be miscounted as safe.
      const seenTiles = new Set<number>()
      for (const tile of req.reveals) {
        if (!Number.isInteger(tile) || tile < 0 || tile >= MINES_TOTAL_TILES) {
          throw new Error(`mines reveal must be an integer in 0..${MINES_TOTAL_TILES - 1}, got ${tile}`)
        }
        if (seenTiles.has(tile)) throw new Error(`mines reveals must be distinct, repeated ${tile}`)
        seenTiles.add(tile)
      }
      const mineSet = new Set(mines)
      let hitTile = -1
      let safeReveals = 0
      for (const tile of req.reveals) {
        if (mineSet.has(tile)) { hitTile = tile; break }
        safeReveals++
      }
      if (hitTile !== -1) {
        return { outcome: 'loss', multiplier: 0, draw: hitTile, draws: mines }
      }
      return {
        outcome: 'win',
        multiplier: minesMultiplier(req.mineCount, safeReveals, req.config),
        draw: -1,
        draws: mines,
      }
    }

    // ── pump ──────────────────────────────────────────────────────────────────
    case 'pump': {
      const pops = derivePops(req.serverSeed, req.clientSeed, req.nonce, req.difficulty)
      const popSet = new Set(pops)
      let hitCell = -1
      for (let i = 0; i < req.pumps; i++) {
        if (popSet.has(i)) { hitCell = i; break }
      }
      if (hitCell !== -1) {
        return { outcome: 'loss', multiplier: 0, draw: hitCell, draws: pops }
      }
      return {
        outcome: 'win',
        multiplier: pumpMultiplier(req.difficulty, req.pumps, req.config),
        draw: -1,
        draws: pops,
      }
    }

    // ── chicken road ──────────────────────────────────────────────────────────
    case 'chickenroad': {
      const spec = CHICKEN_SPECS[req.difficulty]
      const cl = deriveChickenCrashLane(
        req.serverSeed, req.clientSeed, req.nonce, spec.survival, spec.lanes,
      )
      if (req.cashoutLane === 0) {
        return { outcome: 'push', multiplier: 1, draw: cl }
      }
      if (req.cashoutLane < cl) {
        return {
          outcome: 'win',
          multiplier: laneMultiplier(req.cashoutLane, req.difficulty, req.config),
          draw: cl,
        }
      }
      return { outcome: 'loss', multiplier: 0, draw: cl }
    }

    // ── hilo ──────────────────────────────────────────────────────────────────
    case 'hilo': {
      const edge = req.config?.edge ?? DEFAULT_HILO_EDGE
      // cards[0] = start card; cards[1..n] = card drawn for each guess
      const cards = hiloCardsUpTo(req.serverSeed, req.clientSeed, req.nonce, 1 + req.guesses.length)
      let multiplier = 1
      for (let i = 0; i < req.guesses.length; i++) {
        const curRank = cards[i].rank
        const nextRank = cards[i + 1].rank
        const correct =
          req.guesses[i] === 'hi' ? nextRank >= curRank : nextRank <= curRank
        if (!correct) {
          return {
            outcome: 'loss',
            multiplier: 0,
            draw: cards.length,
            draws: cards.map((c) => c.rank),
          }
        }
        // Step multiplier: (1 − edge) / P(win at this rank), min 1
        const p =
          req.guesses[i] === 'hi'
            ? (4 * (HILO_RANKS - curRank + 1)) / HILO_DECK
            : (4 * curRank) / HILO_DECK
        multiplier = round2(multiplier * Math.max(1, round2((1 - edge) / p)))
      }
      // All guesses correct — cash-out at the running multiplier
      return {
        outcome: multiplier > 1 ? 'win' : 'push',
        multiplier,
        draw: cards.length,
        draws: cards.map((c) => c.rank),
      }
    }

    // ── dragon tower ──────────────────────────────────────────────────────────
    case 'dragon-tower': {
      const layout = deriveTower(req.serverSeed, req.clientSeed, req.nonce, req.difficulty)
      for (let row = 0; row < req.picks.length; row++) {
        if (isSkull(layout, row, req.picks[row])) {
          return {
            outcome: 'loss',
            multiplier: 0,
            draw: row, // skull row
            draws: layout.flat(),
          }
        }
      }
      // All picks are eggs — cash out at the current level
      return {
        outcome: 'win',
        multiplier: towerMultiplier(req.difficulty, req.picks.length, req.config),
        draw: req.picks.length, // rows cleared
        draws: layout.flat(),
      }
    }

    // ── baccarat ─────────────────────────────────────────────────────────────
    case 'baccarat': {
      const deal = dealBaccarat(req.serverSeed, req.clientSeed, req.nonce)
      const winnerIndex: Record<BaccaratWinner, number> = { player: 0, banker: 1, tie: 2 }

      let mult: number
      switch (req.bet) {
        case 'player':
          mult = deal.winner === 'player' ? BACCARAT_PAYOUTS.player
               : deal.winner === 'tie'    ? 1  // push
               :                            0  // loss
          break
        case 'banker':
          mult = deal.winner === 'banker' ? BACCARAT_PAYOUTS.banker
               : deal.winner === 'tie'    ? 1
               :                            0
          break
        case 'tie':
          mult = deal.winner === 'tie' ? BACCARAT_PAYOUTS.tie : 0
          break
        case 'playerPair':
          mult = deal.playerPair ? BACCARAT_PAYOUTS.playerPair : 0
          break
        case 'bankerPair':
          mult = deal.bankerPair ? BACCARAT_PAYOUTS.bankerPair : 0
          break
      }
      const outcome = mult > 1 ? 'win' : mult === 1 ? 'push' : 'loss'
      return {
        outcome,
        multiplier: mult,
        draw: winnerIndex[deal.winner],
        draws: [deal.playerTotal, deal.bankerTotal],
      }
    }

    // ── video poker ───────────────────────────────────────────────────────────
    case 'videopoker': {
      if (req.holds.length !== 5) {
        throw new Error(`videopoker holds must have 5 entries, got ${req.holds.length}`)
      }
      const deck = vpDealtDeck(req.serverSeed, req.clientSeed, req.nonce)
      const initial = deck.slice(0, 5)
      let drawPos = 5
      const finalHand = initial.map((card, i) =>
        req.holds[i] ? card : deck[drawPos++],
      )
      const result = vpEvaluateHand(finalHand)
      const mult = result.multiplier
      return {
        outcome: mult > 0 ? 'win' : 'loss',
        multiplier: mult,
        draw: VP_RANKS.indexOf(result.rank),
        draws: finalHand.map((c) => (c.rank - 1) * 4 + c.suit),
      }
    }

    // ── three card poker ──────────────────────────────────────────────────────
    case 'threecardpoker': {
      const { player, dealer } = tcpDeal(req.serverSeed, req.clientSeed, req.nonce)
      const playerValue = tcpEval(player)
      const dealerValue = tcpEval(dealer)

      if (req.bet === 'pairplus') {
        const mult = pairPlusReturn(playerValue)
        return {
          outcome: mult > 0 ? 'win' : 'loss',
          multiplier: mult,
          draw: mult,
        }
      }

      // For 'ante' and 'play', the decision is required.
      const decision = req.decision
      if (decision == null) {
        throw new Error(`threecardpoker bet '${req.bet}' requires a decision ('fold' | 'play')`)
      }

      if (req.bet === 'ante') {
        if (decision === 'fold') {
          return { outcome: 'loss', multiplier: 0, draw: 0 }
        }
        // Play: ante base return + ante bonus (paid regardless of dealer)
        const bonus = anteBonusOdds(playerValue) // to-1 odds; 0 if no qualifying hand
        const qualifies = tcpDealerQualifies(dealerValue)
        let anteBase: number
        if (!qualifies) {
          anteBase = 2  // ante wins 1:1 when dealer doesn't qualify
        } else {
          const cmp = tcpCompare(playerValue, dealerValue)
          anteBase = cmp > 0 ? 2 : cmp < 0 ? 0 : 1 // win/loss/push
        }
        const mult = anteBase + bonus
        const outcome = mult > 1 ? 'win' : mult === 1 ? 'push' : 'loss'
        return { outcome, multiplier: mult, draw: mult }
      }

      // req.bet === 'play'
      if (decision === 'fold') {
        // There is no play wager when the player folds — this request is invalid.
        throw new Error('play wager does not exist when decision is fold')
      }
      const qualifies = tcpDealerQualifies(dealerValue)
      let playMult: number
      if (!qualifies) {
        playMult = 1 // play pushes when dealer doesn't qualify
      } else {
        const cmp = tcpCompare(playerValue, dealerValue)
        playMult = cmp > 0 ? 2 : cmp < 0 ? 0 : 1
      }
      const outcome = playMult > 1 ? 'win' : playMult === 1 ? 'push' : 'loss'
      return { outcome, multiplier: playMult, draw: playMult }
    }

    // ── blackjack ─────────────────────────────────────────────────────────────
    case 'blackjack': {
      const deck = bjShuffle(req.serverSeed, req.clientSeed, req.nonce)
      // Standard deal order: P1, D1, P2, D2
      const playerCards = [deck[0], deck[2]]
      const dealerCards = [deck[1], deck[3]]
      let cursor = 4
      let doubled = false

      // Check natural blackjack (both hands must be checked before player acts)
      const playerNatural = bjIsBlackjack(playerCards)
      const dealerNatural = bjIsBlackjack(dealerCards)
      if (playerNatural || dealerNatural) {
        if (playerNatural && dealerNatural) {
          return { outcome: 'push', multiplier: 1, draw: 21, draws: [21, 21] }
        }
        if (playerNatural) {
          return { outcome: 'win', multiplier: 2.5, draw: 21, draws: [21, bjHandValue(dealerCards).total] }
        }
        // dealer natural, player doesn't have one
        return { outcome: 'loss', multiplier: 0, draw: bjHandValue(playerCards).total, draws: [bjHandValue(playerCards).total, 21] }
      }

      // Process player actions
      for (const action of req.actions) {
        if (action === 'hit') {
          playerCards.push(deck[cursor++])
          if (bjIsBust(playerCards)) {
            return { outcome: 'loss', multiplier: 0, draw: bjHandValue(playerCards).total, draws: [bjHandValue(playerCards).total, bjHandValue(dealerCards).total] }
          }
        } else if (action === 'stand') {
          break
        } else if (action === 'double') {
          doubled = true
          playerCards.push(deck[cursor++])
          break // exactly one card on a double
        }
      }

      if (bjIsBust(playerCards)) {
        return { outcome: 'loss', multiplier: 0, draw: bjHandValue(playerCards).total, draws: [bjHandValue(playerCards).total, bjHandValue(dealerCards).total] }
      }

      // Dealer plays: draws until total ≥ 17 (all 17s, including soft)
      while (bjHandValue(dealerCards).total < 17) {
        dealerCards.push(deck[cursor++])
      }

      const pTotal = bjHandValue(playerCards).total
      const dTotal = bjHandValue(dealerCards).total

      let mult: number
      if (bjIsBust(dealerCards)) {
        mult = 2 // dealer bust → player wins
      } else if (pTotal > dTotal) {
        mult = 2
      } else if (pTotal === dTotal) {
        mult = 1 // push
      } else {
        mult = 0 // loss
      }

      // For a double-down the returned multiplier still applies to each wager
      // individually (original wager + double wager both settle at this rate).
      void doubled // noted for callers; no change to the per-wager multiplier

      const outcome = mult > 1 ? 'win' : mult === 1 ? 'push' : 'loss'
      return { outcome, multiplier: mult, draw: pTotal, draws: [pTotal, dTotal] }
    }

    default: {
      const exhaustive: never = req
      throw new Error(`unsupported game for server grading: ${JSON.stringify(exhaustive)}`)
    }
  }
}
