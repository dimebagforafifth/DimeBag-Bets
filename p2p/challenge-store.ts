/**
 * The challenge store — lifecycle + state for P2P challenges. It holds challenges and, for the
 * accepted ones, the live core holds (Escrow) and the two account refs, so settle/void can
 * resolve through core. EVERY money move delegates to p2p/escrow.ts (→ core place/resolve); the
 * store itself never touches a balance.
 *
 * Lifecycle (guarded — illegal transitions throw):
 *   propose → open
 *   open  + accept  → accepted   (escrow BOTH stakes via core)
 *   open  + decline → declined   (directed offers; no money was held)
 *   open  + sweepExpired(now)    → expired   (past expiresAt; no money was held)
 *   accepted + settle(winner)    → settled   (pot → winner via core; RESULT/operator-driven)
 *   accepted + void              → voided    (refund both via core)
 *
 * Accounts come from an injected AccountBook (playerId → core Account), so the same store backs
 * the demo (seed players + the live viewer registering their real account) and tests (two test
 * accounts). The viewer's `account` IS a real core Account — money stays in core throughout.
 */

import type { Account } from '../core/index.js'
import { accepterStakeFor, EVEN_ODDS } from './odds.js'
import { escrowStakes, settleStakes, voidStakes, type Escrow } from './escrow.js'
import type { Challenge, ChallengeWinner, Challenger } from './types.js'

/** A registry mapping a playerId to its live core Account. */
export interface AccountBook {
  get(playerId: string): Account | undefined
  set(playerId: string, account: Account): void
  has(playerId: string): boolean
}

/** A simple in-memory account book — the viewer registers their real account; seed players theirs. */
export function createAccountBook(seed: Iterable<readonly [string, Account]> = []): AccountBook {
  const m = new Map<string, Account>(seed)
  return {
    get: (id) => m.get(id),
    set: (id, a) => void m.set(id, a),
    has: (id) => m.has(id),
  }
}

/** Per-challenge runtime record: the challenge + (once accepted) its live holds + account refs. */
interface Live {
  challenge: Challenge
  escrow?: Escrow
  proposerAccount?: Account
  accepterAccount?: Account
}

/** What a caller provides to propose a challenge. Stakes are integer cents (credits). */
export interface ProposeInput {
  proposer: Challenger
  title: string
  proposerPick: string
  accepterPick: string
  proposerStakeCents: number
  /** Agreed decimal odds (> 1; default even money 2.0). Implies the accepter's stake. */
  decimalOdds?: number
  /** Open to the community, or directed at one friend. */
  audience: 'open' | 'friend'
  /** Required when audience === 'friend'. */
  targetPlayerId?: string
  targetPlayerName?: string
  /** Minutes until an unaccepted offer expires (default 1 day). */
  expiresInMs?: number
  now: number
}

const DAY = 24 * 60 * 60 * 1000

export interface ChallengeStore {
  propose(input: ProposeInput): Challenge
  accept(id: string, accepter: Challenger, now: number): Challenge
  /** Turn down / withdraw an OPEN offer. `byPlayerId` must be the directed target (the invitee
   *  declining) or the proposer (withdrawing their own offer) — a non-party can't kill an offer. */
  decline(id: string, byPlayerId: string): Challenge
  sweepExpired(now: number): number
  /** RESULT/operator-driven settlement — NOT a player action (a participant must never pick
   *  their own winner). Pays the pot to the winner via core. */
  settle(id: string, winner: ChallengeWinner): Challenge
  /** Refund both stakes via core (event abandoned/cancelled). */
  voidChallenge(id: string): Challenge
  get(id: string): Challenge | undefined
  all(): Challenge[]
  /** Open offers the given player may accept (open audience, or directed at them; not their own). */
  openFor(playerId: string): Challenge[]
  /** Challenges the given player is a party to (proposer or accepter), any status. */
  forPlayer(playerId: string): Challenge[]
  subscribe(cb: () => void): () => void
  version(): number
  reset(): void
}

export function createChallengeStore(accounts: AccountBook): ChallengeStore {
  const map = new Map<string, Live>()
  const listeners = new Set<() => void>()
  let seq = 0
  let ver = 0

  const bump = (): void => {
    ver += 1
    for (const l of listeners) l()
  }

  const live = (id: string): Live => {
    const l = map.get(id)
    if (!l) throw new Error(`unknown challenge ${id}`)
    return l
  }

  const requireStatus = (l: Live, ...allowed: Challenge['status'][]): void => {
    if (!allowed.includes(l.challenge.status)) {
      throw new Error(
        `challenge ${l.challenge.id} is ${l.challenge.status}, expected ${allowed.join('/')}`,
      )
    }
  }

  return {
    propose(input) {
      const decimalOdds = input.decimalOdds ?? EVEN_ODDS
      const proposerStakeCents = input.proposerStakeCents
      if (!Number.isInteger(proposerStakeCents) || proposerStakeCents <= 0) {
        throw new Error('proposer stake must be a positive whole number of credits')
      }
      if (input.audience === 'friend' && !input.targetPlayerId) {
        throw new Error('a friend challenge needs a target player')
      }
      const accepterStakeCents = accepterStakeFor(proposerStakeCents, decimalOdds)
      seq += 1
      const challenge: Challenge = {
        id: `chl_${seq}`,
        proposer: input.proposer,
        accepter:
          input.audience === 'friend' && input.targetPlayerId
            ? { playerId: input.targetPlayerId, playerName: input.targetPlayerName ?? 'Friend' }
            : undefined,
        title: input.title,
        proposerPick: input.proposerPick,
        accepterPick: input.accepterPick,
        proposerStakeCents,
        accepterStakeCents,
        decimalOdds,
        audience: input.audience,
        targetPlayerId: input.audience === 'friend' ? input.targetPlayerId : undefined,
        status: 'open',
        createdAt: input.now,
        expiresAt: input.now + (input.expiresInMs ?? DAY),
      }
      map.set(challenge.id, { challenge })
      bump()
      return challenge
    },

    accept(id, accepter, now) {
      const l = live(id)
      requireStatus(l, 'open')
      const c = l.challenge
      if (now >= c.expiresAt) {
        c.status = 'expired'
        bump()
        throw new Error('this challenge has expired')
      }
      if (c.proposer.playerId === accepter.playerId) {
        throw new Error('you cannot accept your own challenge')
      }
      if (c.audience === 'friend' && c.targetPlayerId && c.targetPlayerId !== accepter.playerId) {
        throw new Error('this challenge was offered to someone else')
      }
      const proposerAccount = accounts.get(c.proposer.playerId)
      const accepterAccount = accounts.get(accepter.playerId)
      if (!proposerAccount) throw new Error(`no account for proposer ${c.proposer.playerId}`)
      if (!accepterAccount) throw new Error(`no account for accepter ${accepter.playerId}`)

      // Escrow BOTH stakes via core — all-or-nothing. Throws (nothing held) if either side
      // can't cover; the challenge stays open so it can still be accepted by someone who can.
      const escrow = escrowStakes(
        proposerAccount,
        c.proposerStakeCents,
        accepterAccount,
        c.accepterStakeCents,
      )
      l.escrow = escrow
      l.proposerAccount = proposerAccount
      l.accepterAccount = accepterAccount
      c.accepter = accepter
      c.status = 'accepted'
      bump()
      return c
    },

    decline(id, byPlayerId) {
      const l = live(id)
      requireStatus(l, 'open')
      const c = l.challenge
      // Authorization: only the invited friend (declining) or the proposer (withdrawing) may
      // kill an open offer. The UI gates this visually, but the store is the singleton of record
      // — without this check any non-party could flip someone else's open offer to terminal.
      const isTarget = c.audience === 'friend' && c.targetPlayerId === byPlayerId
      const isProposer = c.proposer.playerId === byPlayerId
      if (!isTarget && !isProposer) {
        throw new Error('only the invited player or the proposer can decline this challenge')
      }
      // No money was ever held on an open offer — just mark it declined.
      c.status = 'declined'
      bump()
      return c
    },

    sweepExpired(now) {
      let n = 0
      for (const l of map.values()) {
        if (l.challenge.status === 'open' && now >= l.challenge.expiresAt) {
          l.challenge.status = 'expired' // no money was held
          n += 1
        }
      }
      if (n > 0) bump()
      return n
    },

    // ── // SEAM (wiring pass): settle + voidChallenge are the RESULT/OPERATOR money path and
    //    are deliberately NOT exposed to the player UI (ChallengesSection calls only propose/
    //    accept/decline) — a participant must never pick their own winner. The wiring pass must
    //    connect these to the operator result feed (e.g. the console Scores/results overlay that
    //    already grades book fixtures): when a fixture is graded, call challenges.settle(id,
    //    winner); when abandoned, challenges.voidChallenge(id). Until wired, an accepted
    //    challenge keeps both stakes in core `pending` (correct — same as any open book bet),
    //    which means weekly settleWeek must run only after challenges are settled/voided, exactly
    //    like the book. Enforce an operator-role guard at that call site.
    settle(id, winner) {
      const l = live(id)
      requireStatus(l, 'accepted')
      if (!l.escrow || !l.proposerAccount || !l.accepterAccount) {
        throw new Error(`challenge ${id} is accepted but has no escrow`)
      }
      settleStakes(l.proposerAccount, l.accepterAccount, l.escrow, winner)
      l.challenge.status = 'settled'
      l.challenge.winner = winner
      l.challenge.settledAt = Date.now()
      bump()
      return l.challenge
    },

    voidChallenge(id) {
      const l = live(id)
      requireStatus(l, 'accepted')
      if (!l.escrow || !l.proposerAccount || !l.accepterAccount) {
        throw new Error(`challenge ${id} is accepted but has no escrow`)
      }
      voidStakes(l.proposerAccount, l.accepterAccount, l.escrow)
      l.challenge.status = 'voided'
      bump()
      return l.challenge
    },

    get: (id) => map.get(id)?.challenge,
    all: () => [...map.values()].map((l) => l.challenge),

    openFor(playerId) {
      return [...map.values()]
        .map((l) => l.challenge)
        .filter(
          (c) =>
            c.status === 'open' &&
            c.proposer.playerId !== playerId &&
            (c.audience === 'open' || c.targetPlayerId === playerId),
        )
    },

    forPlayer(playerId) {
      return [...map.values()]
        .map((l) => l.challenge)
        .filter((c) => c.proposer.playerId === playerId || c.accepter?.playerId === playerId)
    },

    subscribe(cb) {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },
    version: () => ver,
    reset() {
      map.clear()
      seq = 0
      bump()
    },
  }
}
