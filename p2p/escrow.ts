/**
 * The P2P money path — the trickiest one in the app, and it lives ENTIRELY on top of the
 * shared `core` (place/resolve). There is NO separate ledger, NO balance poke, NO new money
 * concept: a challenge holds both players' stakes with `placeWager` (so each player's balance,
 * credit limit, max/min bet and betting lock are honoured exactly like any other bet), and
 * settles the pot with `resolveWager` (winner = win, loser = loss) so it rolls into the figure
 * and weekly settlement like everything else.
 *
 * THE ZERO-LEAKAGE GUARANTEE (proven in escrow.test.ts):
 *   - accept escrows both stakes → both land in `pending`, no balance change yet.
 *   - settle pays the winner `pot / winnerStake` and the loser a loss; the winner's profit is
 *     exactly the loser's stake, so the two balance moves cancel: pot in = pot out, house = 0.
 *   - void refunds both (no balance change), releasing both holds.
 * Every cent in equals every cent out; the house never gains or loses a credit.
 */

import { placeWager, resolveWager, type Account, type Wager } from '../core/index.js'
import { winnerMultiplier } from './odds.js'
import type { ChallengeWinner } from './types.js'

/** The two live core holds backing an accepted challenge — kept so settle/void can resolve them. */
export interface Escrow {
  proposerWager: Wager
  accepterWager: Wager
}

/**
 * Hold BOTH stakes via core — ALL-OR-NOTHING across the two accounts (the same discipline
 * core.placeWagers gives within one account, extended to two). The accepter's hold is taken
 * first (they are the actor clicking "accept", so their limit error surfaces immediately);
 * if the proposer can no longer cover their side, the accepter's hold is released through the
 * normal void path so nothing is ever stranded in `pending`, and the original error rethrows.
 *
 * Throws (holding nothing net) if either side fails a core check — availableToWager, max/min
 * bet, betting lock, non-integer stake. Each player's limits are respected by construction:
 * the hold IS a `placeWager`, so there is no way to escrow past a player's credit limit.
 */
export function escrowStakes(
  proposer: Account,
  proposerStakeCents: number,
  accepter: Account,
  accepterStakeCents: number,
): Escrow {
  if (proposer.id === accepter.id) {
    // A self-match would let one account be both winner and loser of its own pot.
    throw new Error('a player cannot accept their own challenge')
  }
  // A no-vig pot pays the winner exactly the OTHER side's stake. If an operator has set a
  // per-head max-payout cap below that, core would CLIP the win at settle while the loser still
  // loses their full stake — silently destroying credits and breaking the zero-sum guarantee
  // (the house would effectively gain). Refuse the match up front so the cap is honoured without
  // ever leaking: you can't take a P2P pot that pays you past your max payout.
  if (proposer.maxPayout != null && accepterStakeCents > proposer.maxPayout) {
    throw new Error('this challenge would win more than the proposer’s max payout')
  }
  if (accepter.maxPayout != null && proposerStakeCents > accepter.maxPayout) {
    throw new Error('this challenge would win more than your max payout')
  }
  const accepterWager = placeWager(accepter, accepterStakeCents)
  try {
    const proposerWager = placeWager(proposer, proposerStakeCents)
    return { proposerWager, accepterWager }
  } catch (err) {
    // The proposer can no longer back their offer → release the accepter's hold (void: pending
    // released, balance untouched) so the failed accept leaves both accounts exactly as before.
    resolveWager(accepter, accepterWager, 'void')
    throw err
  }
}

/**
 * Settle the pot to the winner through core: the winner's hold resolves as a WIN at
 * `pot / winnerStake` (profit = the loser's stake) and the loser's hold resolves as a LOSS.
 * The two balance moves are equal and opposite, so the pot the two players put in is paid out
 * in full to the winner and the house nets zero.
 *
 * Settlement is RESULT-driven (operator / graded outcome), never something a participant can
 * call to pick themselves the winner — the store exposes this only to the operator/result path.
 */
export function settleStakes(
  proposer: Account,
  accepter: Account,
  escrow: Escrow,
  winner: ChallengeWinner,
): void {
  const pot = escrow.proposerWager.stake + escrow.accepterWager.stake
  // RE-CHECK the winner's cap at settle, not just at accept: an operator could LOWER a
  // participant's maxPayout after the stakes were escrowed. If the cap would now clip the win
  // below the loser's stake, core would pay the winner less than the pot while still debiting
  // the loser in full — silently leaking credits. Refuse instead, BEFORE touching either wager
  // (so settle stays atomic): the operator must raise the cap or void to refund both. The pot is
  // never destroyed.
  const winnerWager = winner === 'proposer' ? escrow.proposerWager : escrow.accepterWager
  const winnerAccount = winner === 'proposer' ? proposer : accepter
  const loserStake = pot - winnerWager.stake
  if (winnerAccount.maxPayout != null && loserStake > winnerAccount.maxPayout) {
    throw new Error(
      'cannot settle: the winner’s max payout would clip the pot — raise the cap or void to refund both',
    )
  }
  if (winner === 'proposer') {
    resolveWager(
      proposer,
      escrow.proposerWager,
      'win',
      winnerMultiplier(escrow.proposerWager.stake, pot),
    )
    resolveWager(accepter, escrow.accepterWager, 'loss')
  } else {
    resolveWager(
      accepter,
      escrow.accepterWager,
      'win',
      winnerMultiplier(escrow.accepterWager.stake, pot),
    )
    resolveWager(proposer, escrow.proposerWager, 'loss')
  }
}

/**
 * Void an accepted challenge: refund BOTH stakes through core (`void` releases each hold with
 * no balance change — the stake is effectively returned). Used when the underlying event is
 * abandoned/cancelled, mirroring the book's void rule. No house involvement.
 */
export function voidStakes(proposer: Account, accepter: Account, escrow: Escrow): void {
  resolveWager(proposer, escrow.proposerWager, 'void')
  resolveWager(accepter, escrow.accepterWager, 'void')
}
