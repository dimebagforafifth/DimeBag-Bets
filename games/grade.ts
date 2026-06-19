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
 */

import type { Outcome } from '../core/index.js'
import {
  DEFAULT_DICE_CONFIG,
  gradeRoll,
  multiplierFor,
  rollFromSeeds,
  winChance,
  type DiceDirection,
} from './dice/fair.js'
import {
  DEFAULT_LIMBO_CONFIG,
  limboFromSeeds,
  MIN_TARGET as LIMBO_MIN_TARGET,
  type LimboHouseConfig,
} from './limbo/fair.js'

/** The committed round inputs every grade needs — the seed (revealed by the authority)
 *  plus the player-supplied clientSeed/nonce that were fixed at placement. */
interface RoundSeeds {
  serverSeed: string
  clientSeed: string
  nonce: number
}

/** A grade request: the round seeds + the game and its bet parameters. Discriminated by
 *  `game` so each variant carries exactly the inputs its math needs. New games extend the
 *  union (and the switch in `gradeBet`). */
export type GradeRequest =
  | (RoundSeeds & {
      game: 'dice'
      /** Target in [0,100] and the direction the player bet. */
      target: number
      direction: DiceDirection
      /** House edge (default 1%). */
      edge?: number
    })
  | (RoundSeeds & {
      game: 'limbo'
      /** The multiplier the player is shooting for (≥ MIN_TARGET). */
      target: number
      config?: LimboHouseConfig
    })

/** The authoritative result the money layer settles on. */
export interface GradeResult {
  /** win pays at `multiplier`, push returns the stake, loss takes it. */
  outcome: Extract<Outcome, 'win' | 'loss' | 'push'>
  /** The payout multiplier for `service_resolve_wager` — > 1 on a win, 1 on a push,
   *  0 on a loss (the loss path ignores it). */
  multiplier: number
  /** The provably-fair draw, surfaced for display + the verification panel (the roll for
   *  dice, the crash point for limbo). */
  draw: number
}

/**
 * Grade a round from its revealed seed — the SERVER's view of the outcome. Reuses the
 * exact published fair math, so a player re-running the `verify*` helper on the disclosed
 * seed gets the identical result. Throws on an unsupported game or invalid parameters
 * (the same guards the engines apply), so a malformed request can never settle.
 */
export function gradeBet(req: GradeRequest): GradeResult {
  switch (req.game) {
    case 'dice': {
      if (!(req.target >= 0 && req.target <= 100)) {
        throw new Error(`dice target must be in 0..100, got ${req.target}`)
      }
      const config = { edge: req.edge ?? DEFAULT_DICE_CONFIG.edge }
      const roll = rollFromSeeds(req.serverSeed, req.clientSeed, req.nonce)
      const outcome = gradeRoll(roll, req.target, req.direction)
      const mult = multiplierFor(winChance(req.target, req.direction), config)
      if (mult <= 1) {
        // The engine refuses an unwinnable bet (a near-certain target priced ≤ 1×); the
        // server grader must refuse it too rather than settle a "win" that can't profit.
        throw new Error('this bet offers no profit — lower the win chance')
      }
      return {
        outcome,
        multiplier: outcome === 'win' ? mult : outcome === 'push' ? 1 : 0,
        draw: roll,
      }
    }
    case 'limbo': {
      if (!(req.target >= LIMBO_MIN_TARGET)) {
        throw new Error(`limbo target must be ≥ ${LIMBO_MIN_TARGET}, got ${req.target}`)
      }
      const config = req.config ?? DEFAULT_LIMBO_CONFIG
      const point = limboFromSeeds(req.serverSeed, req.clientSeed, req.nonce, config)
      const won = point >= req.target
      return { outcome: won ? 'win' : 'loss', multiplier: won ? req.target : 0, draw: point }
    }
    default: {
      // Exhaustiveness: a new game added to the union without a case lands here at compile
      // time (never assignable) and at runtime throws rather than mis-settling.
      const exhaustive: never = req
      throw new Error(`unsupported game for server grading: ${JSON.stringify(exhaustive)}`)
    }
  }
}
